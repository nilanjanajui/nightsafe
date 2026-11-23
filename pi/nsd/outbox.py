from __future__ import annotations

import json
import logging
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from nsd import config

logger = logging.getLogger(__name__)

# sms_state constants
SMS_PENDING = 0
SMS_SENT = 1
SMS_SUPPRESSED = 2
SMS_EXPIRED = 3

SMS_STATE_NAMES = {
    SMS_PENDING: "pending",
    SMS_SENT: "sent",
    SMS_SUPPRESSED: "suppressed",
    SMS_EXPIRED: "expired",
}


class Outbox:
    """SQLite-backed persistent alert outbox (data/outbox.db)."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or (config.DATA_DIR / "outbox.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=10.0,
            check_same_thread=False,
        )
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 10000;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    occurred REAL NOT NULL,
                    payload TEXT NOT NULL,
                    sms_state INTEGER NOT NULL DEFAULT 0,
                    synced INTEGER NOT NULL DEFAULT 0
                );
                """
            )
            conn.commit()

    def record_alert(self, occurred: float, payload: Dict[str, Any]) -> int:
        """Write alert record to outbox before any delivery attempt.

        Ensures payload has clientId (UUID4).
        """
        if "clientId" not in payload or not payload["clientId"]:
            payload["clientId"] = str(uuid.uuid4())

        payload_json = json.dumps(payload)
        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO alerts (occurred, payload, sms_state, synced)
                VALUES (?, ?, ?, ?);
                """,
                (occurred, payload_json, SMS_PENDING, 0),
            )
            conn.commit()
            alert_id = cursor.lastrowid
            logger.info("Recorded alert #%d in outbox (clientId=%s)", alert_id, payload["clientId"])
            return alert_id

    def get_pending_sms(self) -> List[Tuple[int, float, Dict[str, Any], int, int]]:
        """Get all alerts awaiting SMS delivery (sms_state = 0)."""
        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, occurred, payload, sms_state, synced
                FROM alerts
                WHERE sms_state = ?
                ORDER BY occurred ASC;
                """,
                (SMS_PENDING,),
            )
            rows = cursor.fetchall()
            return [(r[0], r[1], json.loads(r[2]), r[3], r[4]) for r in rows]

    def update_sms_state(self, alert_id: int, new_state: int) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                UPDATE alerts
                SET sms_state = ?
                WHERE id = ?;
                """,
                (new_state, alert_id),
            )
            conn.commit()
            logger.debug("Alert #%d sms_state updated to %s", alert_id, SMS_STATE_NAMES.get(new_state))

    def get_unsynced_alerts(self) -> List[Tuple[int, float, Dict[str, Any], int, int]]:
        """Get all alerts not yet synced to backend (synced = 0)."""
        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, occurred, payload, sms_state, synced
                FROM alerts
                WHERE synced = 0
                ORDER BY occurred ASC;
                """,
            )
            rows = cursor.fetchall()
            return [(r[0], r[1], json.loads(r[2]), r[3], r[4]) for r in rows]

    def update_synced(self, alert_id: int, synced: int = 1) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                UPDATE alerts
                SET synced = ?
                WHERE id = ?;
                """,
                (synced, alert_id),
            )
            conn.commit()
            logger.debug("Alert #%d marked synced=%d", alert_id, synced)

    def get_pending_counts(self) -> Dict[str, int]:
        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM alerts WHERE sms_state = ?;", (SMS_PENDING,))
            pending_sms = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM alerts WHERE synced = 0;")
            unsynced = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM alerts;")
            total = cursor.fetchone()[0]

            return {
                "pending_sms": pending_sms,
                "unsynced": unsynced,
                "total": total,
            }

