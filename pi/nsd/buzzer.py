from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from nsd import config

logger = logging.getLogger(__name__)


class Buzzer:
    """Manages audio feedback via piezo buzzer on BUZZER_PIN.

    If BUZZER_PIN is not configured or gpiozero is unavailable, all actions
    safely degrade to no-ops.
    """

    def __init__(self, pin: Optional[int] = None) -> None:
        self.pin = pin if pin is not None else config.BUZZER_PIN
        self._device = None

        if self.pin is not None:
            try:
                from gpiozero import OutputDevice  # type: ignore
                self._device = OutputDevice(self.pin, active_high=True, initial_value=False)
                logger.info("Buzzer initialized on GPIO pin %d", self.pin)
            except Exception as e:
                logger.warning("Could not initialize buzzer on pin %s: %s (no-op mode)", self.pin, e)
                self._device = None

    def _play_pattern(self, pattern: str) -> None:
        if self._device is None:
            return

        try:
            if pattern == "boot":
                # Single short beep
                self._device.on()
                time.sleep(0.1)
                self._device.off()
            elif pattern == "ready":
                # Double short beep
                for _ in range(2):
                    self._device.on()
                    time.sleep(0.1)
                    self._device.off()
                    time.sleep(0.08)
            elif pattern == "detected":
                # Triple beep indicating distress detected
                for _ in range(3):
                    self._device.on()
                    time.sleep(0.15)
                    self._device.off()
                    time.sleep(0.1)
            elif pattern == "sent":
                # One long confirming beep
                self._device.on()
                time.sleep(0.5)
                self._device.off()
            elif pattern == "failed":
                # 4 rapid beeps indicating failure
                for _ in range(4):
                    self._device.on()
                    time.sleep(0.05)
                    self._device.off()
                    time.sleep(0.05)
        except Exception as e:
            logger.debug("Buzzer error during pattern %s: %s", pattern, e)

    def buzz(self, pattern: str) -> None:
        """Trigger buzzer pattern asynchronously so callers never block."""
        if self._device is None:
            return
        t = threading.Thread(target=self._play_pattern, args=(pattern,), daemon=True)
        t.start()

    def close(self) -> None:
        if self._device is not None:
            try:
                self._device.close()
            except Exception:
                pass
            self._device = None

