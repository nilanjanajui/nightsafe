from __future__ import annotations

import glob
import sys
import time
from typing import List
import numpy as np

from nsd import buzzer, cloud, config, gps, heart, sms


def check_mic() -> None:
    """List audio devices, record 3s, print peak level."""
    print("--- MIC CHECK ---")
    try:
        import sounddevice as sd  # type: ignore
        print("Available audio devices:")
        print(sd.query_devices())
        print("\nRecording 3 seconds from default microphone...")
        fs = 16000
        recording = sd.rec(int(3 * fs), samplerate=fs, channels=1, dtype="int16")
        sd.wait()
        samples = recording.flatten()
        peak = int(np.max(np.abs(samples)))
        peak_pct = round((peak / 32767.0) * 100, 1)
        print(f"Recorded 3s. Peak amplitude: {peak} / 32767 ({peak_pct}%)")
    except Exception as e:
        print(f"Mic check error: {e}")


def check_heart() -> None:
    """Print spidev nodes found, then every 2s for 20s print min/max/swing and BPM."""
    print("--- HEART RATE SENSOR CHECK ---")
    nodes = glob.glob("/dev/spidev*.*")
    print(f"Spidev nodes found: {nodes if nodes else 'None'}")

    monitor = heart.HeartMonitor()
    monitor.start()
    try:
        print("Sampling MCP3008 ADC for 20s (reporting every 2s)...")
        for i in range(10):
            time.sleep(2.0)
            with monitor._lock:
                buf = list(monitor._buffer)
            if buf:
                recent = buf[-500:]  # last 2 seconds
                min_v = round(min(recent), 3)
                max_v = round(max(recent), 3)
                swing_v = round(max_v - min_v, 3)
            else:
                min_v = max_v = swing_v = 0.0

            bpm = monitor.latest()
            bpm_str = f"{bpm} BPM" if bpm is not None else "searching/unavailable"
            print(f"[{i+1}/10] Volts: min={min_v}V, max={max_v}V, swing={swing_v}V | Heart rate: {bpm_str}")
    finally:
        monitor.stop()


def check_gps() -> None:
    """Print GPS fix every 3s."""
    print("--- GPS CHECK ---")
    poller = gps.GpsPoller()
    poller.start()
    try:
        print(f"Polling GPS on {poller.port} at {poller.baud} baud (reporting every 3s)...")
        for i in range(6):
            time.sleep(3.0)
            fix = poller.latest()
            if fix:
                print(f"[{i+1}] Fix: lat={fix['latitude']}, lon={fix['longitude']}, age={fix['age']:.1f}s")
            else:
                print(f"[{i+1}] No GPS fix yet.")
    finally:
        poller.stop()


def check_buzzer() -> None:
    """Test all buzzer patterns."""
    print("--- BUZZER CHECK ---")
    buzz = buzzer.Buzzer()
    if buzz.pin is None:
        print("BUZZER_PIN is not configured.")
        return
    print(f"Testing buzzer on GPIO {buzz.pin}...")
    for pat in ["boot", "ready", "detected", "sent", "failed"]:
        print(f"Playing pattern: {pat}")
        buzz._play_pattern(pat)
        time.sleep(0.5)
    buzz.close()
    print("Buzzer check complete.")


def check_sms() -> None:
    """Send test SMS to cfg.phones()."""
    print("--- SMS CHECK ---")
    cfg = config.DeviceConfig()
    phones = cfg.phones()
    if not phones:
        print("No phones configured. Please add contacts or set EMERGENCY_CONTACT.")
        return
    print(f"Sending test SMS to: {phones}")
    for p in phones:
        msg = f"NightSafe diagnostic test: {cfg.ownerName or 'Device'} can reach you."
        ok = sms.send_sms(p, msg)
        print(f"Send to {p}: {'SUCCESS' if ok else 'FAILED'}")


def check_cloud() -> None:
    """Connect to backend for 12s and print connected status, threshold, and contacts."""
    print("--- CLOUD CHECK ---")
    cfg = config.DeviceConfig()
    client = cloud.CloudClient(cfg=cfg)
    client.start()
    try:
        print(f"Connecting to {config.BACKEND_URL}/device for 12s...")
        for _ in range(12):
            time.sleep(1.0)
            if client.is_connected():
                break
        print(f"Connected: {client.is_connected()}")
        print(f"BPM Threshold: {cfg.bpmThreshold}")
        print(f"Owner Name: '{cfg.ownerName}'")
        print(f"Contacts: {cfg.contacts}")
    finally:
        client.stop()


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m nsd.check mic|heart|gps|buzzer|sms|cloud")
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "mic":
        check_mic()
    elif cmd == "heart":
        check_heart()
    elif cmd == "gps":
        check_gps()
    elif cmd == "buzzer":
        check_buzzer()
    elif cmd == "sms":
        check_sms()
    elif cmd == "cloud":
        check_cloud()
    else:
        print(f"Unknown check command '{cmd}'. Available: mic, heart, gps, buzzer, sms, cloud")
        sys.exit(1)


if __name__ == "__main__":
    main()

