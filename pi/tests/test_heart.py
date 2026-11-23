from __future__ import annotations

import numpy as np
from nsd.heart import calculate_bpm


def test_calculate_bpm_synthetic_70bpm():
    """Verify calculate_bpm on a synthetic 70 BPM signal is within 3 BPM."""
    sample_rate = 250
    duration_sec = 8
    total_samples = sample_rate * duration_sec  # 2000 samples

    bpm_target = 70.0
    period_sec = 60.0 / bpm_target  # ~0.8571 seconds
    samples_per_beat = int(round(sample_rate * period_sec))  # ~214 samples

    # Generate synthetic ECG signal: baseline + periodic QRS peaks
    signal = np.zeros(total_samples, dtype=np.float64)

    # Add R-peaks
    for beat_idx in range(int(duration_sec / period_sec)):
        center = int(beat_idx * samples_per_beat + 50)
        if center + 10 < total_samples:
            # Gaussian-like R peak of 1.5V with slight Q/S dips
            for offset in range(-8, 9):
                idx = center + offset
                if 0 <= idx < total_samples:
                    signal[idx] = 1.5 * np.exp(-0.5 * (offset / 2.0) ** 2)

    # Add small background noise
    np.random.seed(42)
    signal += np.random.normal(0, 0.02, total_samples)

    detected_bpm = calculate_bpm(signal, sample_rate=sample_rate)
    assert detected_bpm is not None, "Failed to detect BPM from synthetic 70 BPM signal"
    assert abs(detected_bpm - 70.0) <= 3.0, f"Expected 70 +/- 3 BPM, got {detected_bpm}"

