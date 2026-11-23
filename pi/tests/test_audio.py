from __future__ import annotations

import numpy as np
from nsd.audio import VadSegmenter


def test_segmentation_fake_vad():
    """Verify VadSegmenter with fake VAD: speech burst, short click, pause under 0.8s, hard cap 10s."""
    dummy_frame = b"\x00" * 960  # 480 16-bit samples

    # 1. Speech burst gives one utterance
    segmenter = VadSegmenter()
    # 10 speech frames to trigger
    for _ in range(10):
        res = segmenter.process_frame(dummy_frame, is_speech=True)
        assert res is None

    # 10 more speech frames (total 20 speech frames)
    for _ in range(10):
        res = segmenter.process_frame(dummy_frame, is_speech=True)
        assert res is None

    # 26 non-speech frames (under 27)
    for _ in range(26):
        res = segmenter.process_frame(dummy_frame, is_speech=False)
        assert res is None

    # 27th non-speech frame ends the utterance
    res = segmenter.process_frame(dummy_frame, is_speech=False)
    assert res is not None
    samples, ts = res
    assert isinstance(samples, np.ndarray)
    assert len(samples) == (20 + 27) * 480

    # 2. Short click is ignored (< 14 frames total)
    segmenter.reset()
    # 10 speech frames to trigger
    for _ in range(10):
        segmenter.process_frame(dummy_frame, is_speech=True)
    # 2 more speech frames -> total 12 frames
    for _ in range(2):
        segmenter.process_frame(dummy_frame, is_speech=True)
    # 27 non-speech frames -> terminates utterance
    for _ in range(26):
        segmenter.process_frame(dummy_frame, is_speech=False)
    res = segmenter.process_frame(dummy_frame, is_speech=False)
    # Ignored because 12 frames of speech < 14 minimum
    assert res is None

    # 3. A pause under 0.8s (e.g. 20 frames = 600ms) does not split
    segmenter.reset()
    for _ in range(10):
        segmenter.process_frame(dummy_frame, is_speech=True)
    # 20 silence frames
    for _ in range(20):
        res = segmenter.process_frame(dummy_frame, is_speech=False)
        assert res is None, "Should not split on silence under 27 frames"
    # Resume speech for 10 frames
    for _ in range(10):
        res = segmenter.process_frame(dummy_frame, is_speech=True)
        assert res is None
    # 27 silence frames to terminate
    for _ in range(26):
        segmenter.process_frame(dummy_frame, is_speech=False)
    res = segmenter.process_frame(dummy_frame, is_speech=False)
    assert res is not None, "Expected combined utterance after full silence"

    # 4. Over 10s (333 frames) is cut at hard cap
    segmenter.reset()
    res = None
    for i in range(350):
        r = segmenter.process_frame(dummy_frame, is_speech=True)
        if r is not None:
            res = r
            break
    assert res is not None
    samples, _ = res
    assert len(samples) == 333 * 480, f"Expected 333 frames hard cap, got {len(samples)/480}"

