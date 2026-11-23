from __future__ import annotations

import logging
from typing import Optional
import numpy as np

from nsd import config

logger = logging.getLogger(__name__)


class BanglaASR:
    """ASR wrapper using faster-whisper on CPU with int8."""

    def __init__(self, model_path: Optional[str] = None) -> None:
        self.model_path = model_path or config.ASR_MODEL_PATH
        self._model = None

    def load(self) -> None:
        if config.NSD_FAKE_MODELS:
            logger.info("NSD_FAKE_MODELS=1: skipping faster-whisper model loading.")
            return

        if self._model is not None:
            return

        try:
            from faster_whisper import WhisperModel  # type: ignore

            logger.info(
                "Loading faster-whisper model from %s (threads=%d)...",
                self.model_path,
                config.ASR_THREADS,
            )
            self._model = WhisperModel(
                self.model_path,
                device="cpu",
                compute_type="int8",
                cpu_threads=config.ASR_THREADS,
            )
            logger.info("faster-whisper model loaded successfully.")
        except Exception as e:
            logger.warning("Could not load faster-whisper model from %s: %s", self.model_path, e)
            self._model = None

    def transcribe(self, audio_data: np.ndarray) -> str:
        """Transcribe float32 audio samples array."""
        if config.NSD_FAKE_MODELS or self._model is None:
            return ""

        try:
            segments, info = self._model.transcribe(
                audio_data,
                language="bn",
                beam_size=1,
                condition_on_previous_text=False,
                without_timestamps=True,
            )
            text = "".join(seg.text for seg in segments).strip()
            return text
        except Exception as e:
            logger.error("ASR transcription failed: %s", e)
            return ""

