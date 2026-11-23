from __future__ import annotations

from typing import Optional


def decide_priority(bpm: Optional[float], bpm_threshold: float = 100.0) -> str:
    """Determine priority according to Spec H.

    HIGH if bpm is None or bpm >= bpmThreshold, otherwise MEDIUM.
    """
    if bpm is None or bpm >= bpm_threshold:
        return "HIGH"
    return "MEDIUM"

