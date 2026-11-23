from __future__ import annotations

import logging
from typing import Optional
import requests

from nsd import config

logger = logging.getLogger(__name__)


def send_sms(
    recipient: str,
    message: str,
    timeout: float = 10.0,
    dry_run: Optional[bool] = None,
) -> bool:
    """Send SMS alert via Textbee HTTPS API.

    Returns True if successfully sent, False otherwise.
    Never logs the API key or secret tokens.
    """
    is_dry_run = dry_run if dry_run is not None else config.SMS_DRY_RUN

    if is_dry_run:
        # Dry run prints the message and returns True
        print(f"[SMS DRY RUN] (dry_run=1) Recipient: {recipient} | Message: {message}")
        logger.info("SMS dry-run completed successfully.")
        return True

    device_id = config.TEXTBEE_DEVICE_ID
    api_key = config.TEXTBEE_API_KEY

    if not device_id or not api_key:
        logger.error("Textbee device ID or API key not configured. Cannot send SMS.")
        return False

    url = f"https://api.textbee.dev/api/v1/gateway/devices/{device_id}/send-sms"
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "recipients": [recipient],
        "message": message,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if response.status_code == 200:
            logger.info("SMS delivered to Textbee gateway successfully.")
            return True
        else:
            logger.warning(
                "SMS gateway responded with HTTP status %d", response.status_code
            )
            return False
    except requests.RequestException as e:
        # Sanitize exception message to ensure API key is never logged
        logger.warning("SMS delivery failed due to network exception: %s", type(e).__name__)
        return False

