from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from nsd import buzzer, config, outbox, sms

logger = logging.getLogger(__name__)


def compose_alert_message(
    priority: str,
    owner_name: str,
    bpm: Optional[float],
    latitude: Optional[float],
    longitude: Optional[float],
    fix_age_sec: Optional[float],
    occurred_sec: float,
    now_sec: Optional[float] = None,
) -> str:
    """Compose alert SMS text strictly following Spec J."""
    now = now_sec if now_sec is not None else time.time()

    owner = owner_name.strip() if owner_name and owner_name.strip() else "The owner of this device"
    hr_str = f"{bpm} BPM" if bpm is not None else "unavailable"

    if latitude is not None and longitude is not None:
        loc_str = f"https://maps.google.com/?q={latitude},{longitude}"
        if fix_age_sec is not None and fix_age_sec > 120.0:
            minutes = int(fix_age_sec // 60)
            loc_str += f" (position {minutes} min old)"
    else:
        loc_str = "unavailable"

    msg = f"NightSafe ALERT ({priority}): {owner} may need help. Heart rate: {hr_str}. Location: {loc_str}"

    delay_sec = now - occurred_sec
    if delay_sec > 60.0:
        late_min = int(delay_sec // 60)
        msg += f". Detected {late_min} min ago"

    return msg


class DeliveryThread:
    """Delivery coordinator thread managing SMS alerts and backend synchronization."""

    def __init__(
        self,
        box: outbox.Outbox,
        cfg: config.DeviceConfig,
        buzz: buzzer.Buzzer,
        cloud_client: Optional[Any] = None,
    ) -> None:
        self.outbox = box
        self.cfg = cfg
        self.buzzer = buzz
        self.cloud = cloud_client

        self._kick_event = threading.Event()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._last_sms_time: float = 0.0
        self._failed_buzzed: Set[int] = set()

    def set_cloud(self, cloud_client: Any) -> None:
        self.cloud = cloud_client

    def kick(self) -> None:
        """Wake up delivery worker immediately."""
        self._kick_event.set()

    def _process_sms_queue(self) -> None:
        pending = self.outbox.get_pending_sms()
        if not pending:
            return

        now = time.time()
        for alert_id, occurred, payload, state, synced in pending:
            client_id = payload.get("clientId", "")

            # Expiry check
            if (now - occurred) > config.SMS_MAX_AGE_SEC:
                logger.info("Alert #%d expired (%d s > max age).", alert_id, int(now - occurred))
                self.outbox.update_sms_state(alert_id, outbox.SMS_EXPIRED)
                if self.cloud and synced:
                    self.cloud.emit_alert_status(client_id, "expired", 0)
                continue

            # Cooldown check
            if self._last_sms_time > 0 and (now - self._last_sms_time) < config.SMS_COOLDOWN_SEC:
                logger.info(
                    "Alert #%d suppressed due to cooldown (%d s < %d s).",
                    alert_id,
                    int(now - self._last_sms_time),
                    config.SMS_COOLDOWN_SEC,
                )
                self.outbox.update_sms_state(alert_id, outbox.SMS_SUPPRESSED)
                if self.cloud and synced:
                    self.cloud.emit_alert_status(client_id, "suppressed", 0)
                continue

            # Deliver to configured phones
            phones = self.cfg.phones()
            if not phones:
                logger.warning("No phones configured for alert #%d; suppressing.", alert_id)
                self.outbox.update_sms_state(alert_id, outbox.SMS_SUPPRESSED)
                if self.cloud and synced:
                    self.cloud.emit_alert_status(client_id, "suppressed", 0)
                continue

            fix_age = None
            if payload.get("latitude") is not None and payload.get("longitude") is not None:
                # If GPS fix timestamp is stored in payload
                fix_time = payload.get("gpsTimestamp")
                if fix_time:
                    fix_age = now - fix_time

            msg = compose_alert_message(
                priority=payload.get("priority", "HIGH"),
                owner_name=self.cfg.ownerName,
                bpm=payload.get("bpm"),
                latitude=payload.get("latitude"),
                longitude=payload.get("longitude"),
                fix_age_sec=fix_age,
                occurred_sec=occurred,
                now_sec=now,
            )

            all_ok = True
            notified_count = 0
            for phone in phones:
                sent_ok = sms.send_sms(phone, msg)
                if sent_ok:
                    notified_count += 1
                else:
                    all_ok = False
                    break

            if all_ok:
                self.outbox.update_sms_state(alert_id, outbox.SMS_SENT)
                self._last_sms_time = now
                self.buzzer.buzz("sent")
                logger.info("Alert #%d sent via SMS to %d recipients.", alert_id, notified_count)
                if self.cloud and synced:
                    self.cloud.emit_alert_status(client_id, "sent", notified_count)
            else:
                # Failure: stop and retry next pass, buzz failed once per alert
                if alert_id not in self._failed_buzzed:
                    self.buzzer.buzz("failed")
                    self._failed_buzzed.add(alert_id)
                logger.warning("SMS delivery failed for alert #%d; stopping pass to retry later.", alert_id)
                break

    def _process_backend_sync(self) -> None:
        if not self.cloud or not self.cloud.is_connected():
            return

        unsynced = self.outbox.get_unsynced_alerts()
        for alert_id, occurred, payload, sms_state, synced in unsynced:
            client_id = payload.get("clientId", "")
            sms_status_str = outbox.SMS_STATE_NAMES.get(sms_state, "unknown")
            occurred_dt = datetime.fromtimestamp(occurred, tz=timezone.utc).isoformat()

            sync_payload = {
                "clientId": client_id,
                "transcript": payload.get("transcript", ""),
                "priority": payload.get("priority", "HIGH"),
                "bpm": payload.get("bpm"),
                "latitude": payload.get("latitude"),
                "longitude": payload.get("longitude"),
                "occurredAt": occurred_dt,
                "smsStatus": sms_status_str,
                "notified": len(self.cfg.phones()) if sms_state == outbox.SMS_SENT else None,
            }

            ok = self.cloud.emit_alert(sync_payload, timeout=5.0)
            if ok:
                self.outbox.update_synced(alert_id, 1)
                logger.info("Alert #%d synced to backend.", alert_id)
            else:
                logger.debug("Backend sync for alert #%d not acknowledged; will retry.", alert_id)
                break

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._process_sms_queue()
                self._process_backend_sync()
            except Exception as e:
                logger.error("Error in delivery worker loop: %s", e)

            # Wait up to 5 seconds or until kicked
            self._kick_event.wait(5.0)
            self._kick_event.clear()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="DeliveryThread")
        self._thread.start()
        logger.info("Delivery thread started.")

    def stop(self) -> None:
        self._stop_event.set()
        self._kick_event.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)

