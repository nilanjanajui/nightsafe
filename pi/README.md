# NightSafe — Pi Daemon

The `nsd` Python package runs on a Raspberry Pi 5 and forms the hardware core of NightSafe. It continuously monitors the microphone, processes speech on-device, reads heart rate from an ECG sensor, tracks GPS location, and dispatches alerts via SMS and WebSocket.

---

## Package Layout

```
pi/
├── nsd/
│   ├── main.py        # Entry point; wires all modules together
│   ├── config.py      # Environment config loader (DeviceConfig)
│   ├── audio.py       # WebRTC VAD + microphone stream (AudioListener, VadSegmenter)
│   ├── asr.py         # faster-whisper Bangla transcription (BanglaASR)
│   ├── classify.py    # Two-stage PyTorch distress classifier (DistressClassifier)
│   ├── heart.py       # ECG heart rate monitor (HeartMonitor)
│   ├── gps.py         # SIM808 GNSS poller (GpsPoller)
│   ├── sms.py         # Textbee SMS dispatch (send_sms)
│   ├── delivery.py    # Delivery thread: SMS cooldown, cloud sync (DeliveryThread)
│   ├── cloud.py       # Socket.IO cloud client (CloudClient)
│   ├── outbox.py      # SQLite alert outbox (Outbox)
│   ├── buzzer.py      # Piezo buzzer feedback (Buzzer)
│   ├── priority.py    # Priority decision logic (decide_priority)
│   └── check.py       # Hardware diagnostic CLI
└── requirements.txt
```

---

## Hardware Wiring

### MCP3008 ADC (SPI)

```
MCP3008 Pin   →   Raspberry Pi 5 GPIO (BCM)
VDD           →   3.3 V
VREF          →   3.3 V
AGND          →   GND
CLK           →   GPIO 11 (SPI0 SCLK)
DOUT          →   GPIO 9  (SPI0 MISO)
DIN           →   GPIO 10 (SPI0 MOSI)
CS/SHDN       →   GPIO 8  (SPI0 CE0)
DGND          →   GND
CH0           →   DFRobot SEN0213 ECG signal output
```

### SIM808 GPS Module (UART)

```
SIM808        →   Raspberry Pi 5
TX            →   GPIO 15 (UART0 RX) → /dev/ttyAMA0
RX            →   GPIO 14 (UART0 TX) → /dev/ttyAMA0
GND           →   GND
VCC           →   External 4.2 V (not 3.3 V)
```

> The SIM808 is used for GPS only. SMS is sent via the Textbee HTTPS API through an Android phone with a SIM card.

### Piezo Buzzer (GPIO)

```
Buzzer +  →  GPIO 18 (BCM) via 100 Ω resistor
Buzzer -  →  GND
```

### Microphone

Connected via USB audio adapter or Raspberry Pi audio HAT. Captured using `sounddevice` with ALSA backend at 16 kHz, 16-bit mono.

---

## Requirements

- Python 3.11+
- Raspberry Pi 5 (or compatible with SPI + UART enabled)
- SPI enabled in `/boot/firmware/config.txt`: `dtparam=spi=on`
- UART enabled and serial console disabled: `enable_uart=1`, remove `console=serial0`

---

## Setup

```bash
cd pi
python -m venv .venv
.venv/bin/pip install -r nsd/requirements.txt
cp .env.example .env   # then edit .env
```

---

## Environment Variables

All variables are loaded from a `.env` file (or real environment) by `config.py`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEVICE_ID` | Yes | — | Device identifier registered in the backend |
| `DEVICE_SECRET` | Yes | — | Device secret (used for Socket.IO auth) |
| `BACKEND_URL` | Yes | — | WebSocket + REST base URL, e.g. `https://api.example.com` |
| `TEXTBEE_API_KEY` | Yes | — | Textbee API key |
| `TEXTBEE_DEVICE_ID` | Yes | — | Textbee gateway device ID (the Android phone) |
| `BPM_THRESHOLD` | No | `100` | Default BPM alert threshold (overridden by backend config push) |
| `SPI_BUS` | No | `0` | SPI bus number for MCP3008 |
| `SPI_DEVICE` | No | `0` | SPI CE number for MCP3008 |
| `ADC_CHANNEL` | No | `0` | MCP3008 channel connected to ECG sensor |
| `GPS_PORT` | No | `/dev/ttyAMA0` | Serial port for SIM808 |
| `GPS_BAUD` | No | `9600` | Baud rate for SIM808 |
| `BUZZER_PIN` | No | `18` | BCM GPIO pin for piezo buzzer |
| `MIC_DEVICE` | No | (system default) | ALSA device name for microphone |
| `NSD_FAKE_MODELS` | No | — | Set to `1` to skip loading ASR and classifier models (dev/test) |
| `SMS_DRY_RUN` | No | — | Set to `1` to skip actual SMS sending |
| `OUTBOX_PATH` | No | `outbox.db` | Path to SQLite outbox database file |

---

## Running

```bash
# Normal operation
.venv/bin/python -m nsd.main

# Inject a text transcript directly (bypass mic + ASR, test the full alert pipeline)
.venv/bin/python -m nsd.main --text "আমাকে বাঁচাও"

# Dry run with fake models (no hardware, no SMS)
NSD_FAKE_MODELS=1 SMS_DRY_RUN=1 .venv/bin/python -m nsd.main --text "আমাকে বাঁচাও"
```

---

## Hardware Diagnostics

The `check.py` module provides individual hardware checks:

```bash
# Check microphone (records 2 s and reports peak level)
.venv/bin/python -m nsd.check mic

# Check ECG / heart rate (reads BPM for 10 s)
.venv/bin/python -m nsd.check heart

# Check GPS (polls SIM808 for a fix, up to 2 min)
.venv/bin/python -m nsd.check gps

# Check buzzer (plays all patterns)
.venv/bin/python -m nsd.check buzzer

# Check SMS (sends a test message via Textbee)
.venv/bin/python -m nsd.check sms

# Check cloud (connects to backend and verifies auth)
.venv/bin/python -m nsd.check cloud
```

---

## Buzzer Patterns

| Pattern | When |
|---------|------|
| `boot` | System startup begins |
| `ready` | All modules loaded, listening starts |
| `detected` | Distress phrase recognised |
| `sent` | SMS delivered successfully |
| `failed` | SMS delivery failed |

---

## Module Descriptions

| Module | Responsibility |
|--------|---------------|
| `config.py` | Loads `.env`, provides `DeviceConfig` with contacts, threshold, save/load |
| `audio.py` | Runs the microphone in a background thread; `VadSegmenter` buffers frames and emits complete speech segments |
| `asr.py` | Loads the faster-whisper int8 CPU model; `transcribe()` returns the Bangla text of a speech segment |
| `classify.py` | Loads a PyTorch model; `classify()` returns `(is_distress: bool, is_urgent: bool)` |
| `heart.py` | Samples ECG via SPI at 250 Hz; applies Butterworth bandpass and peak detection to produce BPM |
| `gps.py` | Sends AT commands to SIM808 over UART; `latest()` returns coordinates up to 10 minutes old |
| `sms.py` | POSTs to the Textbee HTTPS API; `send_sms()` supports dry-run mode |
| `outbox.py` | SQLite WAL store for all alerts; tracks SMS state and cloud-sync state separately |
| `delivery.py` | Background thread; pops pending alerts from the outbox; enforces 60 s cooldown and 900 s expiry; retries cloud sync |
| `cloud.py` | Socket.IO client for the `/device` namespace; sends telemetry every 3 s; handles `config:update` and `test:sms` |
| `buzzer.py` | GPIO buzzer with five named patterns; lazy-initialises GPIO on first use |
| `priority.py` | `decide_priority()` returns `HIGH` if BPM ≥ threshold or BPM unavailable, else `MEDIUM` |
| `main.py` | Starts all threads; runs the main inference loop (VAD segment → ASR → classify → alert) |
| `check.py` | Standalone diagnostic runner for each hardware subsystem |

---

## Project Links

- [Root README](../README.md)
- [Server README](../server/README.md)
- [Web README](../web/README.md)
- [Full Documentation](../DOCUMENTATION.md)
