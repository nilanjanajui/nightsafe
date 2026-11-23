from __future__ import annotations

import argparse
import logging
import queue
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any, Optional

from nsd import asr, audio, buzzer, classify, cloud, config, delivery, gps, heart, outbox, priority, remote_audio

logger = logging.getLogger("nsd")


def setup_logging() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    log_file = config.DATA_DIR / "daemon.log"

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Console output
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root.addHandler(console_handler)

    # Rotating file log: 5 MB x 3 backups
    file_handler = RotatingFileHandler(
        str(log_file),
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="NightSafe Raspberry Pi Daemon")
    parser.add_argument(
        "--text",
        type=str,
        default=None,
        help="Skip mic and ASR, run classifiers and alert flow on provided text",
    )
    args = parser.parse_args()

    setup_logging()
    logger.info("Starting NightSafe daemon (nsd)...")

    shutdown_event = threading_event = delivery.threading.Event()

    def handle_signal(sig: int, frame: Any) -> None:
        logger.info("Received termination signal %d; shutting down...", sig)
        shutdown_event.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Core states
    cfg = config.DeviceConfig()
    box = outbox.Outbox()
    buzz = buzzer.Buzzer()
    buzz.buzz("boot")

    heart_monitor = heart.HeartMonitor()
    gps_poller = gps.GpsPoller()
    delivery_thread = delivery.DeliveryThread(box=box, cfg=cfg, buzz=buzz)

    is_listening = [False]

    cloud_client = cloud.CloudClient(
        cfg=cfg,
        heart_monitor=heart_monitor,
        gps_poller=gps_poller,
        delivery_thread=delivery_thread,
        is_listening_fn=lambda: is_listening[0],
    )
    delivery_thread.set_cloud(cloud_client)

    # Start heart, gps, delivery and cloud first so the device shows Online immediately
    heart_monitor.start()
    gps_poller.start()
    delivery_thread.start()
    cloud_client.start()
    buzz.buzz("ready")

    classifier = classify.DistressClassifier()

    if args.text is not None:
        logger.info("Running in --text test mode with input: '%s'", args.text)
        classifier.load()
        is_distress, is_urgent = classifier.classify(args.text)

        if is_distress and is_urgent:
            logger.info("Distress and urgent positive. Triggering alert flow...")
            buzz.buzz("detected")
            bpm_val = heart_monitor.latest()
            pri = priority.decide_priority(bpm_val, cfg.bpmThreshold)
            fix = gps_poller.latest()
            occurred = time.time()

            payload = {
                "clientId": str(uuid.uuid4()),
                "transcript": args.text,
                "priority": pri,
                "bpm": bpm_val,
                "latitude": fix["latitude"] if fix else None,
                "longitude": fix["longitude"] if fix else None,
                "gpsTimestamp": fix["timestamp"] if fix else None,
                "occurredAt": datetime.fromtimestamp(occurred, tz=timezone.utc).isoformat(),
                "smsStatus": "pending",
                "notified": None,
            }
            alert_id = box.record_alert(occurred, payload)
            delivery_thread.kick()

            # Wait up to 30s for delivery
            logger.info("Waiting up to 30s for delivery completion...")
            t_start = time.time()
            while time.time() - t_start < 30.0:
                counts = box.get_pending_counts()
                if counts["pending_sms"] == 0 and counts["unsynced"] == 0:
                    break
                time.sleep(1.0)
        else:
            logger.info(
                "Input did not meet alert criteria: distress=%s, urgent=%s",
                is_distress,
                is_urgent,
            )

        final_counts = box.get_pending_counts()
        print(
            f"Pending counts: pending_sms={final_counts['pending_sms']}, "
            f"unsynced={final_counts['unsynced']}, total={final_counts['total']}"
        )

        heart_monitor.stop()
        gps_poller.stop()
        delivery_thread.stop()
        cloud_client.stop()
        buzz.close()
        logger.info("Finished --text execution.")
        return

    # Normal daemon loop
    classifier.load()
    asr_engine = asr.BanglaASR()
    asr_engine.load()

    audio_queue: queue.Queue = queue.Queue(maxsize=4)
    if config.AUDIO_SOURCE == "remote":
        listener = remote_audio.RemoteAudioReceiver(audio_queue, config.REMOTE_AUDIO_PORT)
    else:
        listener = audio.AudioListener(audio_queue)
    listener.start()
    is_listening[0] = True
    logger.info("All daemon subsystems running. Listening for audio...")

    try:
        while not shutdown_event.is_set():
            try:
                audio_samples, capture_time = audio_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            audio_len_s = len(audio_samples) / float(audio.SAMPLE_RATE)
            t_asr_start = time.time()
            transcript = asr_engine.transcribe(audio_samples)
            asr_dur_s = time.time() - t_asr_start

            logger.info(
                "ASR processed %.2fs audio in %.2fs: '%s'",
                audio_len_s,
                asr_dur_s,
                transcript,
            )

            if not transcript:
                continue

            is_distress, is_urgent = classifier.classify(transcript)
            if is_distress and is_urgent:
                logger.info("DISTRESS & URGENT detected. Triggering alert!")
                buzz.buzz("detected")
                bpm_val = heart_monitor.latest()
                pri = priority.decide_priority(bpm_val, cfg.bpmThreshold)
                fix = gps_poller.latest()
                occurred = capture_time

                payload = {
                    "clientId": str(uuid.uuid4()),
                    "transcript": transcript,
                    "priority": pri,
                    "bpm": bpm_val,
                    "latitude": fix["latitude"] if fix else None,
                    "longitude": fix["longitude"] if fix else None,
                    "gpsTimestamp": fix["timestamp"] if fix else None,
                    "occurredAt": datetime.fromtimestamp(occurred, tz=timezone.utc).isoformat(),
                    "smsStatus": "pending",
                    "notified": None,
                }
                box.record_alert(occurred, payload)
                delivery_thread.kick()
            elif is_distress and not is_urgent:
                logger.info("Distress detected but NON-URGENT. Logged only; no alert triggered.")
    finally:
        is_listening[0] = False
        listener.stop()
        heart_monitor.stop()
        gps_poller.stop()
        delivery_thread.stop()
        cloud_client.stop()
        buzz.close()
        logger.info("NightSafe daemon stopped.")


if __name__ == "__main__":
    main()

