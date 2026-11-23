from __future__ import annotations

import logging
import subprocess
import threading
import time
from typing import Any, Callable, Dict, Optional
import socketio

from nsd import config, sms

logger = logging.getLogger(__name__)


def get_wifi_signal_pct() -> Optional[int]:
    """Retrieve current WiFi signal percentage via nmcli."""
    try:
        proc = subprocess.run(
            ["nmcli", "-t", "-f", "IN-USE,SIGNAL", "dev", "wifi"],
            capture_output=True,
            text=True,
            timeout=1.0,
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if line.startswith("*:") or line.startswith("\\*:"):
                    parts = line.split(":")
                    if len(parts) >= 2 and parts[1].strip().isdigit():
                        return int(parts[1].strip())
    except Exception:
        pass
    return None


class CloudClient:
    """Socket.IO client communicating with backend /device namespace."""

    def __init__(
        self,
        cfg: config.DeviceConfig,
        heart_monitor: Any = None,
        gps_poller: Any = None,
        delivery_thread: Any = None,
        is_listening_fn: Optional[Callable[[], bool]] = None,
    ) -> None:
        self.cfg = cfg
        self.heart = heart_monitor
        self.gps = gps_poller
        self.delivery = delivery_thread
        self.is_listening_fn = is_listening_fn or (lambda: True)

        self._start_time = time.time()
        self._connected = False
        self._stop_event = threading.Event()
        self._connect_thread: Optional[threading.Thread] = None
        self._telemetry_thread: Optional[threading.Thread] = None

        # python-socketio client with manual reconnection loop
        self.sio = socketio.Client(reconnection=False, logger=False, engineio_logger=False)
        self._register_handlers()

    def set_delivery(self, delivery_thread: Any) -> None:
        self.delivery = delivery_thread

    def _register_handlers(self) -> None:
        @self.sio.on("connect", namespace="/device")
        def on_connect() -> None:
            self._connected = True
            logger.info("Connected to backend /device namespace.")
            if self.delivery:
                self.delivery.kick()

        @self.sio.on("disconnect", namespace="/device")
        def on_disconnect() -> None:
            self._connected = False
            logger.info("Disconnected from backend /device namespace.")

        @self.sio.on("connect_error", namespace="/device")
        def on_connect_error(data: Any) -> None:
            self._connected = False
            logger.debug("Socket.IO connect error: %s", data)

        @self.sio.on("config:update", namespace="/device")
        def on_config_update(data: Dict[str, Any]) -> None:
            logger.info("Received config:update from backend.")
            self.cfg.update(
                bpm_threshold=data.get("bpmThreshold"),
                owner_name=data.get("ownerName"),
                contacts=data.get("contacts"),
            )

        @self.sio.on("test:sms", namespace="/device")
        def on_test_sms(data: Any = None) -> Dict[str, Any]:
            logger.info("Received test:sms request from backend.")
            owner = self.cfg.ownerName or "The owner"
            test_msg = f"NightSafe test: {owner}'s device can reach you."
            phones = self.cfg.phones()
            notified = 0
            for phone in phones:
                if sms.send_sms(phone, test_msg):
                    notified += 1
            return {"ok": notified > 0, "notified": notified}

    def is_connected(self) -> bool:
        return self._connected and bool(self.sio.connected)

    def _connect_loop(self) -> None:
        backoff = 2.0
        while not self._stop_event.is_set():
            if not self.is_connected():
                try:
                    logger.debug("Connecting to %s/device...", config.BACKEND_URL)
                    self.sio.connect(
                        config.BACKEND_URL,
                        namespaces=["/device"],
                        auth={"token": config.DEVICE_TOKEN},
                        transports=["websocket"],
                        wait_timeout=10,
                    )
                    backoff = 2.0
                except Exception as e:
                    self._connected = False
                    logger.debug("Cloud connection failed: %s (retrying in %.1fs)", e, backoff)
                    self._stop_event.wait(backoff)
                    backoff = min(backoff * 2.0, 30.0)
                    continue

            # Connected: wait until disconnected or stopped
            while self.is_connected() and not self._stop_event.is_set():
                self._stop_event.wait(1.0)

    def _telemetry_loop(self) -> None:
        while not self._stop_event.is_set():
            if self.is_connected():
                try:
                    bpm = self.heart.latest() if self.heart else None
                    fix = self.gps.latest() if self.gps else None
                    lat = fix["latitude"] if fix else None
                    lon = fix["longitude"] if fix else None
                    wifi = get_wifi_signal_pct()
                    uptime = int(time.time() - self._start_time)
                    listening = bool(self.is_listening_fn())

                    telemetry_payload = {
                        "bpm": bpm,
                        "latitude": lat,
                        "longitude": lon,
                        "wifiSignalPct": wifi,
                        "uptimeSec": uptime,
                        "listening": listening,
                    }
                    self.sio.emit("telemetry", telemetry_payload, namespace="/device")
                except Exception as e:
                    logger.debug("Telemetry emit failed: %s", e)

            self._stop_event.wait(3.0)

    def emit_alert(self, payload: Dict[str, Any], timeout: float = 5.0) -> bool:
        """Emit alert event with acknowledgment (timeout 5s)."""
        if not self.is_connected():
            return False
        try:
            res = self.sio.call("alert", payload, namespace="/device", timeout=timeout)
            return bool(res and isinstance(res, dict) and res.get("ok"))
        except Exception as e:
            logger.debug("Alert emit call failed: %s", e)
            return False

    def emit_alert_status(self, client_id: str, sms_status: str, notified: Optional[int]) -> None:
        """Emit alert:status event after SMS state change."""
        if not self.is_connected():
            return
        try:
            status_payload = {
                "clientId": client_id,
                "smsStatus": sms_status,
                "notified": notified,
            }
            self.sio.emit("alert:status", status_payload, namespace="/device")
        except Exception as e:
            logger.debug("Alert status emit failed: %s", e)

    def start(self) -> None:
        if self._connect_thread is not None and self._connect_thread.is_alive():
            return
        self._stop_event.clear()
        self._connect_thread = threading.Thread(target=self._connect_loop, daemon=True, name="CloudConnect")
        self._telemetry_thread = threading.Thread(target=self._telemetry_loop, daemon=True, name="CloudTelemetry")
        self._connect_thread.start()
        self._telemetry_thread.start()
        logger.info("Cloud client started.")

    def stop(self) -> None:
        self._stop_event.set()
        try:
            if self.sio.connected:
                self.sio.disconnect()
        except Exception:
            pass
        if self._connect_thread is not None:
            self._connect_thread.join(timeout=1.0)
        if self._telemetry_thread is not None:
            self._telemetry_thread.join(timeout=1.0)

