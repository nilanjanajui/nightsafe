# NightSafe Raspberry Pi Daemon (`nsd`)

A background service for Raspberry Pi 5 that listens for Bangla distress phrases, classifies urgency, monitors heart rate (MCP3008 + SEN0213), tracks GPS location (SIM808), dispatches emergency SMS alerts via Textbee, and synchronizes live telemetry with the NightSafe web backend.

## Architecture

- **`nsd.audio`**: Continuous listener (16 kHz mono int16, 30 ms frames) with WebRTC VAD and pure class segmentation.
- **`nsd.asr`**: CPU-optimized Bangla speech recognition using `faster-whisper` (int8).
- **`nsd.classify`**: Two-stage distress and urgency sequence classification with PyTorch.
- **`nsd.heart`**: Continuous 250 Hz background ECG sampling with Butterworth band-pass filter and R-peak detection.
- **`nsd.gps`**: SIM808 AT command poller caching valid fixes (with 10-minute validity window).
- **`nsd.outbox`**: SQLite-backed durable alert store (`data/outbox.db`) recording alerts before delivery.
- **`nsd.delivery`**: Independent retry loop handling SMS delivery, cooldown, expiry, and backend status synchronization.
- **`nsd.cloud`**: Resilient Socket.IO client with telemetry loop and config updates.
- **`nsd.buzzer`**: Audio status feedback via GPIO.

## Running

```bash
cd pi
python -m nsd.main
```

### Laptop Testing Mode

Run without physical hardware or heavy ML models:
```bash
NSD_FAKE_MODELS=1 SMS_DRY_RUN=1 python -m nsd.main --text "আমাকে বাঁচাও"
```

### Hardware Verification

Diagnose individual hardware subsystems:
```bash
python -m nsd.check mic
python -m nsd.check heart
python -m nsd.check gps
python -m nsd.check buzzer
python -m nsd.check sms
python -m nsd.check cloud
```

