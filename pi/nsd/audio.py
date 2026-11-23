from __future__ import annotations

import collections
import logging
import queue
import re
import subprocess
import threading
import time
from typing import Callable, Deque, List, Optional, Tuple
import numpy as np

from nsd import config

logger = logging.getLogger(__name__)

FRAME_MS = 30
SAMPLE_RATE = 16000
SAMPLES_PER_FRAME = int(SAMPLE_RATE * (FRAME_MS / 1000.0))  # 480 samples
BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2  # 16-bit mono = 960 bytes

PRE_ROLL_COUNT = 10  # 300 ms
START_TRIGGER_COUNT = 7  # >= 7 speech frames in last 10
SILENCE_TRIGGER_COUNT = 27  # ~0.81 s non-speech to end
MIN_UTTERANCE_FRAMES = 14  # ~420 ms minimum length
HARD_CAP_FRAMES = 333  # ~10 s hard cap


class VadSegmenter:
    """Pure segmentation class based on WebRTC VAD frames.

    Can be instantiated and tested with injected frames and an optional custom/fake VAD function.
    """

    def __init__(
        self,
        vad_mode: int = 2,
        is_speech_fn: Optional[Callable[[bytes, int], bool]] = None,
    ) -> None:
        self.vad_mode = vad_mode
        self._is_speech_fn = is_speech_fn

        if self._is_speech_fn is None:
            try:
                import webrtcvad
                vad = webrtcvad.Vad(self.vad_mode)
                self._is_speech_fn = lambda frame_bytes, sr: vad.is_speech(frame_bytes, sr)
            except Exception as e:
                logger.info("webrtcvad not initialized: %s (falling back to all-speech)", e)
                self._is_speech_fn = lambda frame_bytes, sr: True

        self._pre_roll: Deque[Tuple[bytes, float]] = collections.deque(maxlen=PRE_ROLL_COUNT)
        self._recent_flags: Deque[bool] = collections.deque(maxlen=PRE_ROLL_COUNT)
        self._triggered: bool = False
        self._current_frames: List[Tuple[bytes, float]] = []
        self._silence_count: int = 0
        self._start_time: float = 0.0

    def reset(self) -> None:
        self._pre_roll.clear()
        self._recent_flags.clear()
        self._triggered = False
        self._current_frames.clear()
        self._silence_count = 0
        self._start_time = 0.0

    def process_frame(
        self,
        frame_bytes: bytes,
        is_speech: Optional[bool] = None,
        timestamp: Optional[float] = None,
    ) -> Optional[Tuple[np.ndarray, float]]:
        """Feed a 30 ms frame (480 int16 samples).

        Returns (audio_float32, capture_timestamp) when an utterance completes, or None.
        """
        ts = timestamp if timestamp is not None else time.time()

        if is_speech is None:
            is_speech = bool(self._is_speech_fn(frame_bytes, SAMPLE_RATE))

        self._recent_flags.append(is_speech)

        if not self._triggered:
            self._pre_roll.append((frame_bytes, ts))
            if len(self._recent_flags) == PRE_ROLL_COUNT and sum(self._recent_flags) >= START_TRIGGER_COUNT:
                self._triggered = True
                self._current_frames = list(self._pre_roll)
                self._silence_count = 0
                self._start_time = self._current_frames[0][1] if self._current_frames else ts
            return None

        # Already triggered
        self._current_frames.append((frame_bytes, ts))
        if not is_speech:
            self._silence_count += 1
        else:
            self._silence_count = 0

        # Check completion conditions
        is_hard_cap = len(self._current_frames) >= HARD_CAP_FRAMES
        is_silence_end = self._silence_count >= SILENCE_TRIGGER_COUNT

        if is_hard_cap or is_silence_end:
            speech_frames_count = len(self._current_frames) - (self._silence_count if is_silence_end else 0)
            frames_to_emit = list(self._current_frames)
            emit_time = self._start_time

            self.reset()

            if speech_frames_count < MIN_UTTERANCE_FRAMES:
                # Ignore clicks or transient noises under 14 speech frames
                return None

            raw_bytes = b"".join(f[0] for f in frames_to_emit)
            samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            return samples, emit_time

        return None


def setup_mic_gain(mic_name: str, volume: int = 28) -> None:
    """Find ALSA card matching mic_name and configure gain with amixer."""
    card_index: Optional[str] = None

    if mic_name:
        try:
            with open("/proc/asound/cards", "r", encoding="utf-8") as f:
                content = f.read()
            # Match lines like " 2 [Device         ]: USB-Audio - ... Boya ..."
            for line in content.splitlines():
                if mic_name.lower() in line.lower():
                    m = re.match(r"\s*(\d+)\s*\[", line)
                    if m:
                        card_index = m.group(1)
                        break
        except Exception as e:
            logger.debug("Could not inspect /proc/asound/cards: %s", e)

    if card_index is None:
        card_index = "0"  # default ALSA card

    commands = [
        ["amixer", "-c", card_index, "set", "Mic Capture Switch", "on"],
        ["amixer", "-c", card_index, "set", "Mic Capture Volume", str(volume)],
        ["amixer", "-c", card_index, "set", "Auto Gain Control", "on"],
    ]
    for cmd in commands:
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=2.0)
        except Exception:
            pass


class AudioListener:
    """Always-on audio listener thread reading 16 kHz int16 audio."""

    def __init__(
        self,
        output_queue: queue.Queue[Tuple[np.ndarray, float]],
        vad_mode: Optional[int] = None,
    ) -> None:
        self.output_queue = output_queue
        self.vad_mode = vad_mode if vad_mode is not None else config.VAD_MODE
        self.segmenter = VadSegmenter(vad_mode=self.vad_mode)

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _stream_loop(self) -> None:
        setup_mic_gain(config.MIC_NAME, config.MIC_VOLUME)

        try:
            import sounddevice as sd  # type: ignore
        except (ImportError, OSError) as e:
            logger.info("sounddevice not available (%s); AudioListener running in passive mode.", e)
            return

        while not self._stop_event.is_set():
            try:
                self.segmenter.reset()
                with sd.RawInputStream(
                    samplerate=SAMPLE_RATE,
                    blocksize=SAMPLES_PER_FRAME,
                    channels=1,
                    dtype="int16",
                ) as stream:
                    logger.info("Audio stream opened successfully.")
                    while not self._stop_event.is_set():
                        data, overflowed = stream.read(SAMPLES_PER_FRAME)
                        if overflowed:
                            logger.debug("Audio input overflowed.")
                        result = self.segmenter.process_frame(bytes(data))
                        if result is not None:
                            # Queue size max 4; drop oldest when full
                            if self.output_queue.full():
                                try:
                                    self.output_queue.get_nowait()
                                    logger.warning("Audio queue full (max 4); dropped oldest utterance.")
                                except queue.Empty:
                                    pass
                            try:
                                self.output_queue.put_nowait(result)
                            except queue.Full:
                                pass
            except Exception as e:
                logger.warning("Audio stream error: %s (waiting 3s and reopening)", e)
                self._stop_event.wait(3.0)

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._stream_loop, daemon=True, name="AudioThread")
        self._thread.start()
        logger.info("Audio listener thread started.")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=1.0)
