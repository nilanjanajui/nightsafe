from __future__ import annotations

import time
from nsd.delivery import compose_alert_message


def test_message_composition_variants():
    """Verify message composition variants according to Spec J."""
    now = time.time()

    # 1. Normal message with all fields
    msg1 = compose_alert_message(
        priority="HIGH",
        owner_name="Nilanjana",
        bpm=105.0,
        latitude=22.3569,
        longitude=91.7832,
        fix_age_sec=30.0,
        occurred_sec=now - 10.0,
        now_sec=now,
    )
    expected1 = (
        "NightSafe ALERT (HIGH): Nilanjana may need help. "
        "Heart rate: 105.0 BPM. Location: https://maps.google.com/?q=22.3569,91.7832"
    )
    assert msg1 == expected1

    # 2. Fallback owner name and unavailable BPM & Location
    msg2 = compose_alert_message(
        priority="MEDIUM",
        owner_name="",
        bpm=None,
        latitude=None,
        longitude=None,
        fix_age_sec=None,
        occurred_sec=now,
        now_sec=now,
    )
    expected2 = (
        "NightSafe ALERT (MEDIUM): The owner of this device may need help. "
        "Heart rate: unavailable. Location: unavailable"
    )
    assert msg2 == expected2

    # 3. Stale position (> 120s old)
    msg3 = compose_alert_message(
        priority="HIGH",
        owner_name="Test User",
        bpm=92.0,
        latitude=22.3569,
        longitude=91.7832,
        fix_age_sec=185.0,  # ~3 min old
        occurred_sec=now,
        now_sec=now,
    )
    assert "(position 3 min old)" in msg3

    # 4. Late detection (> 60s late)
    msg4 = compose_alert_message(
        priority="HIGH",
        owner_name="Test User",
        bpm=None,
        latitude=None,
        longitude=None,
        fix_age_sec=None,
        occurred_sec=now - 150.0,  # 2.5 min late
        now_sec=now,
    )
    assert ". Detected 2 min ago" in msg4

