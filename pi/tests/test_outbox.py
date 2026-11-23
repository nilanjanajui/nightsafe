from __future__ import annotations

import time
from pathlib import Path
from nsd.outbox import Outbox, SMS_PENDING, SMS_SENT


def test_outbox_lifecycle_and_persistence(tmp_path: Path):
    """Verify outbox lifecycle and persistence across restart."""
    db_file = tmp_path / "test_outbox.db"

    # Instance 1
    box1 = Outbox(db_path=db_file)
    t0 = time.time()
    id1 = box1.record_alert(t0, {"transcript": "বাঁচাও ১", "priority": "HIGH"})
    id2 = box1.record_alert(t0 + 1.0, {"transcript": "বাঁচাও ২", "priority": "MEDIUM"})

    pending = box1.get_pending_sms()
    assert len(pending) == 2
    assert pending[0][0] == id1
    assert pending[1][0] == id2

    # Mark id1 as sent and synced
    box1.update_sms_state(id1, SMS_SENT)
    box1.update_synced(id1, 1)

    counts = box1.get_pending_counts()
    assert counts["pending_sms"] == 1
    assert counts["unsynced"] == 1
    assert counts["total"] == 2

    # Simulate restart by creating a new Outbox instance on the same file
    box2 = Outbox(db_path=db_file)
    pending_restart = box2.get_pending_sms()
    assert len(pending_restart) == 1
    assert pending_restart[0][0] == id2
    assert pending_restart[0][2]["transcript"] == "বাঁচাও ২"

    unsynced = box2.get_unsynced_alerts()
    assert len(unsynced) == 1
    assert unsynced[0][0] == id2

