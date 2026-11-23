from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

from nsd import config

logger = logging.getLogger(__name__)

GPS_FIX_MAX_AGE_SEC = 600.0  # 10 minutes


def _nmea_to_decimal(raw_value: str) -> float:
    """Convert NMEA coordinate ddmm.mmmm (or dddmm.mmmm) to decimal degrees."""
    val = float(raw_value)
    degrees = int(val // 100)
    minutes = val - (degrees * 100)
    return degrees + (minutes / 60.0)


def parse_cgpsinf(raw_text: str) -> Optional[Dict[str, float]]:
    """Parse +CGPSINF response into {'latitude': float, 'longitude': float}.

    Handles:
    - Standard NMEA with hemisphere: +CGPSINF: 0,2221.414000,N,09146.992000,E,...
    - Decimal direct format: +CGPSINF: 0,22.356900,91.783200,...
    - Swapped lat/lon format
    - Empty, zero or garbage samples
    """
    if not raw_text or "+CGPSINF:" not in raw_text:
        return None

    try:
        line = [ln.strip() for ln in raw_text.splitlines() if ln.strip().startswith("+CGPSINF:")][0]
        parts = line.split(":", 1)[1].strip().split(",")
        if len(parts) < 3:
            return None

        # Check for presence of N/S or E/W hemisphere flags
        # Typical format: mode, lat, lat_dir, lon, lon_dir, date, time...
        lat_val: Optional[float] = None
        lon_val: Optional[float] = None

        if len(parts) >= 5 and parts[2].upper() in ("N", "S") and parts[4].upper() in ("E", "W"):
            # Normal NMEA format
            lat = _nmea_to_decimal(parts[1])
            if parts[2].upper() == "S":
                lat = -lat
            lon = _nmea_to_decimal(parts[3])
            if parts[4].upper() == "W":
                lon = -lon
            lat_val, lon_val = lat, lon
        elif len(parts) >= 5 and parts[2].upper() in ("E", "W") and parts[4].upper() in ("N", "S"):
            # Swapped format with hemisphere
            lon = _nmea_to_decimal(parts[1])
            if parts[2].upper() == "W":
                lon = -lon
            lat = _nmea_to_decimal(parts[3])
            if parts[4].upper() == "S":
                lat = -lat
            lat_val, lon_val = lat, lon
        else:
            # Fallback format: mode, lat, lon (could be NMEA or decimal)
            f1 = float(parts[1])
            f2 = float(parts[2])

            # Determine which is lat and which is lon
            def to_dec(val: float) -> float:
                if abs(val) > 180.0:  # NMEA format e.g. 2221.414 or 09146.992
                    return _nmea_to_decimal(str(val))
                return val

            c1 = to_dec(f1)
            c2 = to_dec(f2)

            # Lat is [-90, 90], Lon is [-180, 180]
            if -90.0 <= c1 <= 90.0 and -180.0 <= c2 <= 180.0:
                lat_val, lon_val = c1, c2
            elif -90.0 <= c2 <= 90.0 and -180.0 <= c1 <= 180.0:
                # Swapped
                lat_val, lon_val = c2, c1

        if lat_val is None or lon_val is None:
            return None

        # Discard (0, 0) Null Island coordinates or out of range
        if abs(lat_val) < 1e-4 and abs(lon_val) < 1e-4:
            return None
        if not (-90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0):
            return None

        return {"latitude": round(lat_val, 6), "longitude": round(lon_val, 6)}
    except Exception:
        return None


class GpsPoller:
    """Background poller querying SIM808 GPS over serial every 5 seconds."""

    def __init__(self, port: Optional[str] = None, baud: Optional[int] = None) -> None:
        self.port = port or config.GPS_PORT
        self.baud = baud or config.GPS_BAUD
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._latest_fix: Optional[Dict[str, Any]] = None
        self._fix_time: float = 0.0

    def _send_at(self, ser: Any, cmd: str, wait_sec: float = 0.5) -> str:
        ser.write((cmd + "\r\n").encode())
        time.sleep(wait_sec)
        in_waiting = getattr(ser, "in_waiting", 0)
        return ser.read(in_waiting or 100).decode("utf-8", errors="replace")

    def _poll_once(self, ser: Any) -> Optional[Dict[str, float]]:
        self._send_at(ser, "AT+CGPSPWR=1", 0.3)
        status = self._send_at(ser, "AT+CGPSSTATUS?", 0.3)
        if "3D Fix" not in status and "2D Fix" not in status:
            return None
        raw_inf = self._send_at(ser, "AT+CGPSINF=0", 0.5)
        return parse_cgpsinf(raw_inf)

    def _worker_loop(self) -> None:
        try:
            import serial  # lazy import
        except ImportError:
            logger.info("pyserial is not available; GPS poller running in mock mode.")
            return

        ser = None
        while not self._stop_event.is_set():
            try:
                if ser is None:
                    ser = serial.Serial(self.port, baudrate=self.baud, timeout=2.0)
                    logger.info("GPS serial port opened on %s", self.port)

                fix = self._poll_once(ser)
                if fix:
                    with self._lock:
                        self._latest_fix = fix
                        self._fix_time = time.time()
            except Exception as e:
                logger.debug("GPS serial error on %s: %s (retrying in 5s)", self.port, e)
                if ser is not None:
                    try:
                        ser.close()
                    except Exception:
                        pass
                    ser = None

            self._stop_event.wait(5.0)

        if ser is not None:
            try:
                ser.close()
            except Exception:
                pass

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="GpsThread")
        self._thread.start()
        logger.info("GPS poller thread started.")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)

    def latest(self) -> Optional[Dict[str, Any]]:
        """Return latest valid fix with age in seconds, or None if > 10 min old."""
        with self._lock:
            if self._latest_fix is None:
                return None
            age = time.time() - self._fix_time
            if age > GPS_FIX_MAX_AGE_SEC:
                return None
            return {
                "latitude": self._latest_fix["latitude"],
                "longitude": self._latest_fix["longitude"],
                "timestamp": self._fix_time,
                "age": age,
            }

