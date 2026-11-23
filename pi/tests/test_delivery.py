from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock
from nsd import config, outbox
from nsd.buzzer import Buzzer
from nsd.delivery import DeliveryThread


def test_delivery_decisions(tmp_path: Path, monkeypatch):
    """Verify delivery decisions: cooldown, expiry, retry on failure with sms and cloud faked."""
    db_file = tmp_path / "delivery_test.db"
    box = outbox.Outbox(db_path=db_file)

    cfg = config.DeviceConfig(_config_path=tmp_path / "cfg.json")
    cfg.contacts = [{"name": "Contact", "phone": "+8801711111111"}]

    mock_buzzer = MagicMock(spec=Buzzer)
    mock_cloud = MagicMock()
    mock_cloud.is_connected.return_value = True
    mock_cloud.emit_alert.return_value = True

    dt = DeliveryThread(box=box, cfg=cfg, buzz=mock_buzzer, cloud_client=mock_cloud)

    # 1. Successful SMS delivery
    monkeypatch.setattr("nsd.sms.send_sms", lambda recipient, msg: True)
    now = time.time()
    id1 = box.record_alert(now, {"transcript": "Alert 1", "priority": "HIGH"})
    dt._process_sms_queue()

    pending = box.get_pending_sms()
    assert len(pending) == 0, "Alert 1 should have been sent"
    mock_buzzer.buzz.assert_called_with("sent")

    # 2. Cooldown suppression: alert 2 occurs 10s after alert 1 (cooldown = 60s)
    id2 = box.record_alert(now + 10.0, {"transcript": "Alert 2", "priority": "HIGH"})
    dt._process_sms_queue()
    pending = box.get_pending_sms()
    assert len(pending) == 0, "Alert 2 should have been processed"

    # Check alert 2 state in database is SMS_SUPPRESSED
    with box._get_connection() as conn:
        state = conn.execute("SELECT sms_state FROM alerts WHERE id = ?", (id2,)).fetchone()[0]
    assert state == outbox.SMS_SUPPRESSED

    # 3. Expiry: alert 3 occurred 1000s ago (> 900s max age)
    dt._last_sms_time = 0.0  # reset cooldown
    old_time = time.time() - 1000.0
    id3 = box.record_alert(old_time, {"transcript": "Alert 3", "priority": "HIGH"})
    dt._process_sms_queue()

    with box._get_connection() as conn:
        state3 = conn.execute("SELECT sms_state FROM alerts WHERE id = ?", (id3,)).fetchone()[0]
    assert state3 == outbox.SMS_EXPIRED

    # 4. Retry on failure: SMS send returns False
    mock_buzzer.reset_mock()
    monkeypatch.setattr("nsd.sms.send_sms", lambda recipient, msg: False)
    id4 = box.record_alert(time.time(), {"transcript": "Alert 4", "priority": "HIGH"})
    dt._process_sms_queue()

    # Alert 4 should remain pending and failed buzzer should be called once
    pending4 = box.get_pending_sms()
    assert len(pending4) == 1
    assert pending4[0][0] == id4
    mock_buzzer.buzz.assert_called_with("failed")

