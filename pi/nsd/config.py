from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Search for pi/.env or .env in the parent hierarchy
_PI_DIR = Path(__file__).resolve().parent.parent
_ENV_PATH = _PI_DIR / ".env"
if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH)
else:
    load_dotenv()

# Settings and defaults
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:4000")
DEVICE_TOKEN: str = os.getenv("DEVICE_TOKEN", "")
TEXTBEE_API_KEY: str = os.getenv("TEXTBEE_API_KEY", "")
TEXTBEE_DEVICE_ID: str = os.getenv("TEXTBEE_DEVICE_ID", "")
EMERGENCY_CONTACT: str = os.getenv("EMERGENCY_CONTACT", "")

ASR_MODEL_PATH: str = os.getenv(
    "ASR_MODEL_PATH", "/home/nightsafe/nightsafe/bangla_whisper_ct2"
)
STAGE1_MODEL_PATH: str = os.getenv(
    "STAGE1_MODEL_PATH",
    "/home/nightsafe/nightsafe/models/stage1/nightsafe_stage1_final",
)
STAGE2_MODEL_PATH: str = os.getenv(
    "STAGE2_MODEL_PATH",
    "/home/nightsafe/nightsafe/models/stage2/nightsafe_stage2_final",
)

ASR_THREADS: int = int(os.getenv("ASR_THREADS", "3"))
MIC_NAME: str = os.getenv("MIC_NAME", "")
MIC_VOLUME: int = int(os.getenv("MIC_VOLUME", "28"))
VAD_MODE: int = int(os.getenv("VAD_MODE", "2"))
GPS_PORT: str = os.getenv("GPS_PORT", "/dev/ttyAMA0")
GPS_BAUD: int = int(os.getenv("GPS_BAUD", "9600"))

_buzzer_env = os.getenv("BUZZER_PIN")
BUZZER_PIN: Optional[int] = int(_buzzer_env) if _buzzer_env and _buzzer_env.strip() else None

SMS_COOLDOWN_SEC: int = int(os.getenv("SMS_COOLDOWN_SEC", "60"))
SMS_MAX_AGE_SEC: int = int(os.getenv("SMS_MAX_AGE_SEC", "900"))

_data_dir_env = os.getenv("DATA_DIR", "pi/data")
DATA_DIR: Path = Path(_data_dir_env)
if not DATA_DIR.is_absolute():
    # If run from pi/ or repo root, make sure it resolves properly
    if Path.cwd().name == "pi":
        # running inside pi/
        DATA_DIR = Path("data") if _data_dir_env == "pi/data" else Path(_data_dir_env)
    else:
        DATA_DIR = Path(_data_dir_env)
DATA_DIR.mkdir(parents=True, exist_ok=True)

SMS_DRY_RUN: bool = os.getenv("SMS_DRY_RUN", "0").lower() in ("1", "true", "yes")
NSD_FAKE_MODELS: bool = os.getenv("NSD_FAKE_MODELS", "0").lower() in ("1", "true", "yes")

_hr_bus = os.getenv("HR_SPI_BUS")
HR_SPI_BUS: Optional[int] = int(_hr_bus) if _hr_bus and _hr_bus.strip() else None

_hr_dev = os.getenv("HR_SPI_DEVICE")
HR_SPI_DEVICE: Optional[int] = int(_hr_dev) if _hr_dev and _hr_dev.strip() else None


@dataclass
class DeviceConfig:
    """Persistent local configuration updated from server or defaults."""
    bpmThreshold: float = 100.0
    ownerName: str = ""
    contacts: List[Dict[str, str]] = field(default_factory=list)
    _config_path: Path = field(default_factory=lambda: DATA_DIR / "device_config.json")
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.load()

    def phones(self) -> List[str]:
        """Return list of contact phone numbers; fallback to EMERGENCY_CONTACT."""
        with self._lock:
            active_phones: List[str] = [
                c.get("phone", "").strip()
                for c in self.contacts
                if isinstance(c, dict) and c.get("phone", "").strip()
            ]
            if active_phones:
                return active_phones
            if EMERGENCY_CONTACT and EMERGENCY_CONTACT.strip():
                return [EMERGENCY_CONTACT.strip()]
            return []

    def load(self) -> None:
        """Load state from data/device_config.json if present."""
        with self._lock:
            if not self._config_path.exists():
                return
            try:
                with open(self._config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "bpmThreshold" in data:
                    self.bpmThreshold = float(data["bpmThreshold"])
                if "ownerName" in data:
                    self.ownerName = str(data["ownerName"])
                if "contacts" in data and isinstance(data["contacts"], list):
                    self.contacts = [
                        {"name": str(c.get("name", "")), "phone": str(c.get("phone", ""))}
                        for c in data["contacts"]
                        if isinstance(c, dict)
                    ]
            except Exception as e:
                logger.error("Failed to load device_config.json: %s", e)

    def save(self) -> None:
        """Atomically persist to data/device_config.json."""
        with self._lock:
            payload = {
                "bpmThreshold": self.bpmThreshold,
                "ownerName": self.ownerName,
                "contacts": self.contacts,
            }
            tmp_fd, tmp_path = tempfile.mkstemp(
                dir=str(self._config_path.parent),
                prefix="device_config_",
                suffix=".tmp",
            )
            try:
                with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2)
                os.replace(tmp_path, self._config_path)
            except Exception as e:
                logger.error("Failed to save device_config.json: %s", e)
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass
                raise

    def update(
        self,
        bpm_threshold: Optional[float] = None,
        owner_name: Optional[str] = None,
        contacts: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Update in memory and persist atomically."""
        if bpm_threshold is not None:
            self.bpmThreshold = float(bpm_threshold)
        if owner_name is not None:
            self.ownerName = str(owner_name)
        if contacts is not None:
            self.contacts = [
                {"name": str(c.get("name", "")), "phone": str(c.get("phone", ""))}
                for c in contacts
                if isinstance(c, dict)
            ]
        self.save()

