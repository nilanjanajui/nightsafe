from __future__ import annotations

import logging
from typing import Optional, Tuple

from nsd import config

logger = logging.getLogger(__name__)


class DistressClassifier:
    """Two-stage classifier: Stage 1 (distress) and Stage 2 (urgency).

    Alert is triggered only if BOTH stage 1 and stage 2 are positive.
    Distress-but-not-urgent is logged only.
    """

    def __init__(
        self,
        stage1_path: Optional[str] = None,
        stage2_path: Optional[str] = None,
    ) -> None:
        self.stage1_path = stage1_path or config.STAGE1_MODEL_PATH
        self.stage2_path = stage2_path or config.STAGE2_MODEL_PATH

        self._stage1_tokenizer = None
        self._stage1_model = None
        self._stage2_tokenizer = None
        self._stage2_model = None

    def load(self) -> None:
        if config.NSD_FAKE_MODELS:
            logger.info("NSD_FAKE_MODELS=1: skipping PyTorch sequence classifier loading.")
            return

        if self._stage1_model is not None:
            return

        try:
            import torch  # type: ignore  # type: ignore
            from transformers import AutoModelForSequenceClassification, AutoTokenizer  # type: ignore

            torch.set_num_threads(1)

            logger.info("Loading Stage 1 model from %s...", self.stage1_path)
            self._stage1_tokenizer = AutoTokenizer.from_pretrained(self.stage1_path)
            self._stage1_model = AutoModelForSequenceClassification.from_pretrained(self.stage1_path)
            self._stage1_model.eval()

            logger.info("Loading Stage 2 model from %s...", self.stage2_path)
            self._stage2_tokenizer = AutoTokenizer.from_pretrained(self.stage2_path)
            self._stage2_model = AutoModelForSequenceClassification.from_pretrained(self.stage2_path)
            self._stage2_model.eval()

            logger.info("Distress classifiers loaded successfully.")
        except Exception as e:
            logger.warning("Could not load sequence classification models: %s", e)
            self._stage1_model = None
            self._stage2_model = None

    def classify(self, text: str) -> Tuple[bool, bool]:
        """Classify input text.

        Returns (is_distress, is_urgent).
        """
        if not text or not text.strip():
            return False, False

        # Laptop / testing fake mode
        if config.NSD_FAKE_MODELS:
            if "বাঁচাও" in text:
                return True, True
            return False, False

        if self._stage1_model is None or self._stage2_model is None:
            logger.warning("Classifiers not loaded; cannot evaluate distress.")
            return False, False

        try:
            import torch  # type: ignore

            # Stage 1: Distress
            inputs1 = self._stage1_tokenizer(
                text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=128,
            )
            with torch.inference_mode():
                out1 = self._stage1_model(**inputs1)
                distress_pred = torch.argmax(out1.logits, dim=1).item()

            is_distress = (distress_pred == 1)
            if not is_distress:
                return False, False

            # Stage 2: Urgency
            inputs2 = self._stage2_tokenizer(
                text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=128,
            )
            with torch.inference_mode():
                out2 = self._stage2_model(**inputs2)
                urgent_pred = torch.argmax(out2.logits, dim=1).item()

            is_urgent = (urgent_pred == 1)
            return is_distress, is_urgent
        except Exception as e:
            logger.error("Classification error: %s", e)
            return False, False

