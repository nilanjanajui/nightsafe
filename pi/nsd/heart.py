from __future__ import annotations

import glob
import logging
import re
import threading
import time
from collections import deque
from typing import Deque, List, Optional, Sequence, Tuple
import numpy as np
from scipy.signal import butter, find_peaks, sosfiltfilt

from nsd import config

logger = logging.getLogger(__name__)

HR_SAMPLE_RATE = 250  # Hz
HR_BUFFER_DURATION = 8  # seconds
HR_BUFFER_SIZE = HR_SAMPLE_RATE * HR_BUFFER_DURATION  # 2000 samples
HR_CALC_INTERVAL = 2.0  # recalculate BPM every 2 seconds
ADC_CHANNEL = 0
ADC_VREF = 3.3

# Precompute 3rd order Butterworth band-pass filter (5-20 Hz)
_NYQUIST = HR_SAMPLE_RATE / 2.0
HR_FILTER = butter(3, [5.0 / _NYQUIST, 20.0 / _NYQUIST], btype="bandpass", output="sos")


def calculate_bpm(signal: Sequence[float], sample_rate: int = HR_SAMPLE_RATE) -> Optional[float]:
    """Pure DSP function from reference: bandpass (5-20 Hz, order 3) + find_peaks.

    Returns estimated BPM or None if no valid heart rate could be detected.
    """
    if len(signal) < sample_rate * 4:
        return None

    arr = np.asarray(signal, dtype=np.float64)
    arr = arr - np.mean(arr)

    # Avoid processing entirely flat signals
    if np.all(np.abs(arr) < 1e-6):
        return None

    try:
        filtered = sosfiltfilt(HR_FILTER, arr)
    except Exception:
        return None

    positive_strength = np.percentile(filtered, 98)
    negative_strength = abs(np.percentile(filtered, 2))

    if negative_strength > positive_strength:
        detection_signal = -filtered
    else:
        detection_signal = filtered

    spread = np.percentile(detection_signal, 75) - np.percentile(detection_signal, 25)
    prominence = max(spread * 1.5, 0.005)

    min_peak_distance = int(sample_rate * 0.25)  # 240 BPM cap
    peaks, _ = find_peaks(
        detection_signal,
        distance=min_peak_distance,
        prominence=prominence,
    )

    if len(peaks) < 2:
        return None

    recent_peaks = peaks[-8:]
    intervals = np.diff(recent_peaks) / float(sample_rate)

    # Filter by physiological interval window: 0.30s (200 BPM) to 2.0s (30 BPM)
    intervals = intervals[(intervals >= 0.30) & (intervals <= 2.0)]

    if len(intervals) == 0:
        return None

    median_interval = np.median(intervals)
    if median_interval <= 0:
        return None

    return round(float(60.0 / median_interval), 1)


def find_spi_device() -> Tuple[Optional[int], Optional[int]]:
    """Auto-detect SPI bus and device (prefer CE0), overridable via env config."""
    if config.HR_SPI_BUS is not None and config.HR_SPI_DEVICE is not None:
        return config.HR_SPI_BUS, config.HR_SPI_DEVICE

    nodes = glob.glob("/dev/spidev*.*")
    if not nodes:
        return None, None

    # Prefer CE0 (ending in .0)
    ce0_nodes = [n for n in nodes if n.endswith(".0")]
    chosen = ce0_nodes[0] if ce0_nodes else nodes[0]

    match = re.search(r"spidev(\d+)\.(\d+)", chosen)
    if match:
        return int(match.group(1)), int(match.group(2))
    return None, None


class HeartMonitor:
    """Continuous heart rate monitor via MCP3008 ADC and spidev."""

    def __init__(self) -> None:
        self._spi = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._buffer: Deque[float] = deque(maxlen=HR_BUFFER_SIZE)
        self._latest_bpm: Optional[float] = None
        self._latest_time: float = 0.0

        self._init_spi()

    def _init_spi(self) -> None:
        bus, dev = find_spi_device()
        if bus is None or dev is None:
            logger.info("No SPI devices found at /dev/spidev*.* (operating in mock/None mode)")
            return

        try:
            import spidev  # type: ignore
            spi = spidev.SpiDev()
            spi.open(bus, dev)
            spi.max_speed_hz = 1_000_000
            spi.mode = 0
            self._spi = spi
            logger.info("Heart rate sensor initialized on /dev/spidev%d.%d", bus, dev)
        except Exception as e:
            logger.info("spidev could not be opened on bus %s, dev %s: %s (never crash)", bus, dev, e)
            self._spi = None

    def _read_adc(self) -> float:
        if self._spi is None:
            return 0.0
        try:
            resp = self._spi.xfer2([1, (8 + ADC_CHANNEL) << 4, 0])
            raw = ((resp[1] & 0x03) << 8) | resp[2]
            return float((raw * ADC_VREF) / 1023.0)
        except Exception:
            return 0.0

    def _worker_loop(self) -> None:
        next_sample_time = time.perf_counter()
        sample_interval = 1.0 / HR_SAMPLE_RATE
        last_calc_time = time.time()

        while not self._stop_event.is_set():
            v = self._read_adc()
            self._buffer.append(v)

            now = time.time()
            if now - last_calc_time >= HR_CALC_INTERVAL:
                last_calc_time = now
                if len(self._buffer) >= HR_SAMPLE_RATE * 4:
                    bpm = calculate_bpm(list(self._buffer))
                    if bpm is not None:
                        with self._lock:
                            self._latest_bpm = bpm
                            self._latest_time = now

            next_sample_time += sample_interval
            sleep_sec = next_sample_time - time.perf_counter()
            if sleep_sec > 0:
                time.sleep(sleep_sec)
            else:
                next_sample_time = time.perf_counter()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker_loop, daemon=True, name="HeartThread")
        self._thread.start()
        logger.info("Heart rate sampling thread started.")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)
        if self._spi is not None:
            try:
                self._spi.close()
            except Exception:
                pass
            self._spi = None

    def latest(self) -> Optional[float]:
        """Return the latest detected BPM, or None if older than 10 seconds."""
        with self._lock:
            if self._latest_bpm is None or (time.time() - self._latest_time) > 10.0:
                return None
            return self._latest_bpm

