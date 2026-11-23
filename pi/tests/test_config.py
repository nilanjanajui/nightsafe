from __future__ import annotations

from pathlib import Path
from nsd import config


def test_device_config_persistence_and_fallback(tmp_path: Path, monkeypatch):
    """Verify DeviceConfig atomic persistence and fallback contact logic."""
    cfg_path = tmp_path / "device_config.json"
    monkeypatch.setattr(config, "EMERGENCY_CONTACT", "+8801700000000")

    cfg = config.DeviceConfig(_config_path=cfg_path)
    # Default threshold
    assert cfg.bpmThreshold == 100.0
    assert cfg.ownerName == ""
    assert cfg.contacts == []

    # Fallback contact returns EMERGENCY_CONTACT
    assert cfg.phones() == ["+8801700000000"]

    # Update config
    cfg.update(
        bpm_threshold=110.5,
        owner_name="Nilanjana",
        contacts=[{"name": "Sister", "phone": "+8801811111111"}],
    )
    assert cfg.phones() == ["+8801811111111"]

    # Reload from disk
    cfg2 = config.DeviceConfig(_config_path=cfg_path)
    assert cfg2.bpmThreshold == 110.5
    assert cfg2.ownerName == "Nilanjana"
    assert len(cfg2.contacts) == 1
    assert cfg2.phones() == ["+8801811111111"]

