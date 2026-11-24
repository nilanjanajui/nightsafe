import os
import time
import queue
import threading
import numpy as np
import serial
import requests
import spidev
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from scipy.io.wavfile import read as wav_read
from scipy.signal import butter, sosfiltfilt, find_peaks
from faster_whisper import WhisperModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import uuid
from collections import deque
import socketio
from datetime import datetime, timezone
from dotenv import dotenv_values

# =========================================================
# PATHS (edit to match the Pi's file system)
# =========================================================
ASR_MODEL_PATH = "/home/nightsafe/nightsafe/bangla_whisper_ct2"
STAGE1_MODEL_PATH = "/home/nightsafe/nightsafe/models/stage1/nightsafe_stage1_final"
STAGE2_MODEL_PATH = "/home/nightsafe/nightsafe/models/stage2/nightsafe_stage2_final"
GPS_PORT = "/dev/ttyAMA0"
PI_ENV_PATH = "/home/nightsafe/nightsafe-repo/pi/.env"

# =========================================================
# CREDENTIALS: read from pi/.env (wins over shell exports), then environment.
# No secrets are hardcoded in this file.
# =========================================================
_PI_ENV = dotenv_values(PI_ENV_PATH)


def _cfg(name, default=""):
    return _PI_ENV.get(name) or os.environ.get(name, default)


TEXTBEE_DEVICE_ID = _cfg("TEXTBEE_DEVICE_ID")
TEXTBEE_API_KEY = _cfg("TEXTBEE_API_KEY")
EMERGENCY_CONTACT = _cfg("EMERGENCY_CONTACT")
BACKEND_URL = _cfg("BACKEND_URL")
DEVICE_TOKEN = _cfg("DEVICE_TOKEN")

LISTEN_PORT = 8000            # laptop sends the recorded audio to this port
TEMP_AUDIO_FILE = "live_test.wav"
GPS_BAUD_RATE = 9600

# ---- Heart rate (DFRobot SEN0213 + MCP3008) settings ----
HR_SAMPLE_RATE = 250
HR_MEASURE_DURATION = 8
ADC_CHANNEL = 0
ADC_VREF = 3.3

HR_SPI_BUS = 0
HR_SPI_DEVICE = 0
HR_SPI_SPEED = 1_000_000

HR_PEAK_LOW = 5.0
HR_PEAK_HIGH = 20.0
HR_MIN_PEAK_DISTANCE = int(HR_SAMPLE_RATE * 0.25)

# ---- Website BPM smoothing: rolling median of the per-second estimates ----
HR_SMOOTH_WINDOW = 60         # seconds
HR_SMOOTH_MIN = 8             # min valid estimates before a value is shown

# ---- GPS settings ----
GPS_POLL_SEC = 2
GPS_MAX_AGE = 120             # seconds; older fixes are treated as unavailable
# Field order in +CGPSINF: "auto" swaps if the first value cannot be a latitude,
# "lat_lon" or "lon_lat" forces the order. Verify with one raw line outdoors.
GPS_FIELD_ORDER = _cfg("GPS_FIELD_ORDER", "auto")

# ---- Priority decision settings ----
BPM_ELEVATED_THRESHOLD = 100.0

# ---- Startup check: missing credentials ----
for _name, _val in [("TEXTBEE_DEVICE_ID", TEXTBEE_DEVICE_ID),
                    ("TEXTBEE_API_KEY", TEXTBEE_API_KEY),
                    ("EMERGENCY_CONTACT", EMERGENCY_CONTACT)]:
    if not _val or "PASTE" in _val:
        print(f"WARNING: {_name} is missing in pi/.env. SMS will fail until you set it.")

# ---- Load ASR model ----
print("Loading ASR model...")
asr_model = WhisperModel(ASR_MODEL_PATH, device="cpu", compute_type="int8")

# ---- Load Stage 1 model (distress / non-distress) ----
print("Loading Stage 1 model...")
stage1_tokenizer = AutoTokenizer.from_pretrained(STAGE1_MODEL_PATH)
stage1_model = AutoModelForSequenceClassification.from_pretrained(STAGE1_MODEL_PATH)
stage1_model.eval()

# ---- Load Stage 2 model (urgent / non-urgent) ----
print("Loading Stage 2 model...")
stage2_tokenizer = AutoTokenizer.from_pretrained(STAGE2_MODEL_PATH)
stage2_model = AutoModelForSequenceClassification.from_pretrained(STAGE2_MODEL_PATH)
stage2_model.eval()

# ---- Set up heart rate hardware (SPI) ----
print("Setting up heart rate sensor (DFRobot SEN0213 + MCP3008)...")
hr_spi = spidev.SpiDev()
hr_spi.open(HR_SPI_BUS, HR_SPI_DEVICE)
hr_spi.max_speed_hz = HR_SPI_SPEED
hr_spi.mode = 0

hr_peak_filter = butter(
    3,
    [HR_PEAK_LOW / (HR_SAMPLE_RATE / 2), HR_PEAK_HIGH / (HR_SAMPLE_RATE / 2)],
    btype="bandpass",
    output="sos"
)

# Shared state. Both must exist before any thread that reads them starts.
hr_state = {"bpm": None,          # fast value (last ~8 s), used for alert priority
            "bpm_smooth": None}   # 60 s rolling median, shown on the website
gps_state = {"loc": None}     # (lat, lon, unix_ts), replaced as one tuple so reads are never half-updated

# ---- Receiver: audio recorded on the LAPTOP arrives here ----
audio_queue = queue.Queue()


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        tmp = TEMP_AUDIO_FILE + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, TEMP_AUDIO_FILE)
        audio_queue.put(TEMP_AUDIO_FILE)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Receiver)
threading.Thread(target=server.serve_forever, daemon=True).start()

# ---- Website: Socket.IO connection + telemetry (shows the device online) ----
sio = socketio.Client(reconnection=False)
_start_time = time.time()


def _current_gps():
    """Latest fix if younger than GPS_MAX_AGE, else None. Never blocks."""
    loc = gps_state["loc"]
    if loc and time.time() - loc[2] <= GPS_MAX_AGE:
        return {"latitude": loc[0], "longitude": loc[1]}
    return None


def _cloud_loop():
    while True:
        if not sio.connected:
            try:
                sio.connect(BACKEND_URL, namespaces=["/device"], auth={"token": DEVICE_TOKEN},
                            transports=["websocket"], wait_timeout=30)
                print("Connected to website backend.")
            except Exception as e:
                print(f"Website connect failed: {e} (retrying)")
                time.sleep(5)
                continue
        try:
            loc = _current_gps()
            sio.emit("telemetry", {
                "bpm": hr_state["bpm_smooth"],
                "uptimeSec": int(time.time() - _start_time),
                "listening": True,
                "latitude": loc["latitude"] if loc else None,
                "longitude": loc["longitude"] if loc else None,
            }, namespace="/device")
        except Exception:
            pass
        time.sleep(3)


if BACKEND_URL and DEVICE_TOKEN:
    threading.Thread(target=_cloud_loop, daemon=True).start()
else:
    print("WARNING: BACKEND_URL or DEVICE_TOKEN missing in pi/.env. Website connection disabled.")

print("All models and sensors loaded. Ready.\n")


# ---------------- 1) Audio (from laptop) -> Text ----------------
def record_audio(filename):
    """Waits for the laptop to send a recording (instead of using a mic on the Pi)."""
    print("Waiting for audio from the laptop... (press Enter on the laptop and speak)")
    while True:
        try:
            path = audio_queue.get(timeout=1)   # timeout lets Ctrl+C work
            break
        except queue.Empty:
            continue
    try:
        sr, data = wav_read(path)
        print(f"Audio received. Sample rate: {sr} Hz | Peak level: {int(np.abs(data).max())}")
    except Exception:
        print("Audio received.")
    return path


def transcribe(filename):
    """Runs the audio file through the Bangla ASR model and returns transcribed text."""
    segments, info = asr_model.transcribe(filename, language="bn", task="transcribe")
    text = "".join([seg.text for seg in segments])
    return text


# ---------------- 2) Distress / Urgency ----------------
def predict_distress(text):
    """Returns 1 if distress, 0 if non-distress."""
    inputs = stage1_tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    with torch.no_grad():
        outputs = stage1_model(**inputs)
    return torch.argmax(outputs.logits, dim=1).item()


def predict_urgency(text):
    """Returns 1 if urgent, 0 if non-urgent. Only call this if distress == 1."""
    inputs = stage2_tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    with torch.no_grad():
        outputs = stage2_model(**inputs)
    return torch.argmax(outputs.logits, dim=1).item()


# ---------------- 3) Heart rate ----------------
def hr_read_adc(channel=ADC_CHANNEL):
    """Read one channel from MCP3008 (0-7)."""
    response = hr_spi.xfer2([1, (8 + channel) << 4, 0])
    return ((response[1] & 0x03) << 8) | response[2]


def hr_calculate_bpm(signal):
    """Runs bandpass + peak detection on a raw voltage array, returns BPM or None."""
    if len(signal) < HR_SAMPLE_RATE * 4:
        return None

    signal = np.asarray(signal)
    signal = signal - np.mean(signal)

    filtered = sosfiltfilt(hr_peak_filter, signal)

    positive_strength = np.percentile(filtered, 98)
    negative_strength = abs(np.percentile(filtered, 2))

    if negative_strength > positive_strength:
        detection_signal = -filtered
    else:
        detection_signal = filtered

    spread = np.percentile(detection_signal, 75) - np.percentile(detection_signal, 25)
    prominence = max(spread * 1.5, 0.005)

    peaks, _ = find_peaks(
        detection_signal,
        distance=HR_MIN_PEAK_DISTANCE,
        prominence=prominence
    )

    if len(peaks) < 2:
        return None

    recent_peaks = peaks[-8:]
    intervals = np.diff(recent_peaks) / HR_SAMPLE_RATE

    # Physiological sanity range for this educational detector.
    # This is NOT a diagnostic limit.
    intervals = intervals[(intervals >= 0.30) & (intervals <= 2.0)]

    if len(intervals) == 0:
        return None

    return round(60.0 / np.median(intervals), 1)


def get_heart_rate(duration=HR_MEASURE_DURATION):
    """Samples the SEN0213 for `duration` seconds and returns BPM, or None.
    Not used in the main flow (the continuous reader replaces it); kept for manual tests."""
    samples = []
    next_sample_time = time.perf_counter()
    start = time.perf_counter()

    while time.perf_counter() - start < duration:
        adc_value = hr_read_adc(ADC_CHANNEL)
        voltage = (adc_value * ADC_VREF) / 1023.0
        samples.append(voltage)

        next_sample_time += 1.0 / HR_SAMPLE_RATE
        sleep_time = next_sample_time - time.perf_counter()

        if sleep_time > 0:
            time.sleep(sleep_time)
        else:
            next_sample_time = time.perf_counter()

    bpm = hr_calculate_bpm(samples)

    if bpm is None:
        print("Heart rate: not enough beats detected.")

    return bpm


# ---------------- 3a) Continuous heart rate ----------------
hr_stop = threading.Event()


def _hr_loop():
    """Samples the sensor nonstop. hr_state["bpm"] is the fast estimate (last HR_MEASURE_DURATION s);
    hr_state["bpm_smooth"] is the rolling median over HR_SMOOTH_WINDOW s for display."""
    buf = deque(maxlen=HR_SAMPLE_RATE * HR_MEASURE_DURATION)
    hist = deque()   # (timestamp, bpm) of valid per-second estimates
    next_sample_time = time.perf_counter()
    last_calc = 0.0
    while not hr_stop.is_set():
        try:
            buf.append((hr_read_adc(ADC_CHANNEL) * ADC_VREF) / 1023.0)
            next_sample_time += 1.0 / HR_SAMPLE_RATE
            sleep_time = next_sample_time - time.perf_counter()
            if sleep_time > 0:
                time.sleep(sleep_time)
            else:
                next_sample_time = time.perf_counter()
            if time.time() - last_calc >= 1.0:
                last_calc = time.time()
                now = last_calc
                b = hr_calculate_bpm(list(buf))
                hr_state["bpm"] = None if b is None else float(b)
                if b is not None:
                    hist.append((now, float(b)))
                while hist and now - hist[0][0] > HR_SMOOTH_WINDOW:
                    hist.popleft()
                hr_state["bpm_smooth"] = (
                    int(round(np.median([x[1] for x in hist]))) if len(hist) >= HR_SMOOTH_MIN else None
                )
        except Exception as e:
            hr_state["bpm"] = None   # never leave a stale value after a sensor error
            hr_state["bpm_smooth"] = None
            hist.clear()
            print(f"Heart rate read error: {e}")
            time.sleep(1)


threading.Thread(target=_hr_loop, daemon=True).start()


# ---------------- 3b) Priority decision ----------------
def decide_priority(bpm):
    """
    Only called when urgency_result == 1 (urgent).

    - elevated/unknown bpm (>= BPM_ELEVATED_THRESHOLD or None) -> HIGH
    - normal bpm (< BPM_ELEVATED_THRESHOLD)                    -> MEDIUM
    """
    elevated = (bpm is None) or (bpm >= BPM_ELEVATED_THRESHOLD)
    return "HIGH" if elevated else "MEDIUM"


# ---------------- 4) GPS (continuous) ----------------
def send_at_gps(ser, command, wait=1):
    ser.write((command + "\r\n").encode())
    time.sleep(wait)
    response = ser.read(ser.in_waiting or 1).decode(errors='replace')
    return response


def nmea_to_decimal(raw_value, is_longitude=False):
    """ddmm.mmmm (or dddmm.mmmm) -> decimal degrees. Hemisphere is not applied:
    fine for N/E locations such as Bangladesh, wrong for S or W."""
    raw_value = float(raw_value)
    degrees = int(raw_value // 100)
    minutes = raw_value - (degrees * 100)
    decimal = degrees + (minutes / 60)
    return round(decimal, 6)


def parse_cgpsinf(raw):
    """Parses '+CGPSINF: mode,<a>,<b>,...' into (lat, lon), or None."""
    try:
        line = [l for l in raw.split("\n") if l.strip().startswith("+CGPSINF:")][0]
        f = line.split(":", 1)[1].strip().split(",")
        a = float(f[1])
        b = float(f[2])
    except (IndexError, ValueError):
        return None

    if GPS_FIELD_ORDER == "lon_lat":
        lon_raw, lat_raw = a, b
    elif GPS_FIELD_ORDER == "lat_lon":
        lat_raw, lon_raw = a, b
    else:  # auto: a latitude cannot exceed 90 degrees (ddmm.mmmm > 9000)
        if a >= 9000:
            lon_raw, lat_raw = a, b
        else:
            lat_raw, lon_raw = a, b

    lat = nmea_to_decimal(lat_raw)
    lon = nmea_to_decimal(lon_raw, is_longitude=True)
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


gps_stop = threading.Event()


def _gps_loop():
    """Owns the GPS serial port. Updates gps_state with the latest fix."""
    ser = None
    while not gps_stop.is_set():
        try:
            if ser is None:
                ser = serial.Serial(GPS_PORT, baudrate=GPS_BAUD_RATE, timeout=1)
                send_at_gps(ser, "AT+CGPSPWR=1")
            ser.reset_input_buffer()
            status = send_at_gps(ser, "AT+CGPSSTATUS?")
            if "3D Fix" in status or "2D Fix" in status:
                fix = parse_cgpsinf(send_at_gps(ser, "AT+CGPSINF=0"))
                if fix:
                    gps_state["loc"] = (fix[0], fix[1], time.time())
            time.sleep(GPS_POLL_SEC)
        except Exception as e:
            print(f"GPS error: {e}")
            try:
                if ser:
                    ser.close()
            except Exception:
                pass
            ser = None
            time.sleep(3)
    if ser:
        try:
            ser.close()
        except Exception:
            pass


def get_gps_coordinates():
    """Latest fix if younger than GPS_MAX_AGE, else None. Never blocks."""
    return _current_gps()


threading.Thread(target=_gps_loop, daemon=True).start()


# ---------------- 5) SMS via textbee ----------------
def send_sms(recipient, message):
    """Sends an SMS through textbee.dev using the linked Android device."""
    url = f"https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms"
    headers = {
        "x-api-key": TEXTBEE_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "recipients": [recipient],
        "message": message
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"SMS send failed: {e}")
        return None


# ---------------- Main test flow ----------------
def run_one_test():
    """Full pipeline: audio from laptop -> transcribe -> distress -> urgency ->
    (only if urgent) heart rate -> priority -> GPS -> SMS.

    SMS is sent ONLY when distress == 1 AND urgency == 1 (urgent).
    Non-urgent distress is logged but does NOT send an alert.
    """
    # 1) Laptop mic -> text
    audio_file = record_audio(TEMP_AUDIO_FILE)
    t0 = time.time()
    t1 = t0
    text = transcribe(audio_file)
    t2 = time.time()
    print(f"\nTranscribed text: {text}")

    if not text.strip():
        print("Nothing was transcribed (silence or unclear speech). Try again.")
        print("-" * 60)
        return

    # 2) Distress
    distress_result = predict_distress(text)
    t3 = time.time()

    if distress_result == 0:
        print("Stage 1: NON-DISTRESS")
        print("-> No alert would be triggered.")
        print(f"\nTiming -- ASR: {t2 - t1:.2f}s | Classify: {t3 - t2:.2f}s | Total: {t3 - t0:.2f}s")
        print("-" * 60)
        return

    print("Stage 1: DISTRESS")

    # 3) Urgency
    urgency_result = predict_urgency(text)
    t4 = time.time()
    urgency_label = "URGENT" if urgency_result == 1 else "non-urgent"
    print(f"Stage 2: {urgency_label}")

    if urgency_result == 0:
        print("-> Distress detected but NON-URGENT. No SMS alert sent.")
        print(f"\nTiming -- ASR: {t2 - t1:.2f}s | Classify: {t4 - t2:.2f}s | Total: {t4 - t0:.2f}s")
        print("-" * 60)
        return

    # ---- From here on, only reached when distress AND urgent ----

    # 4) Heart rate
    bpm = hr_state["bpm"]   # continuous reading: latest value, no waiting
    t5 = time.time()
    if bpm is not None:
        print(f"Heart rate: {bpm} BPM")
    else:
        print("Heart rate: unavailable.")

    # 5) Priority
    priority = decide_priority(bpm)
    print(f"-> Alert WOULD be triggered. Priority: {priority}")

    # 6) GPS (latest fix from the background reader, returns instantly)
    location = get_gps_coordinates()
    t6 = time.time()

    maps_link = None
    if location:
        maps_link = f"https://maps.google.com/?q={location['latitude']},{location['longitude']}"
        print(f"Location: {location['latitude']}, {location['longitude']}")
        print(f"Maps link: {maps_link}")
    else:
        print("No recent GPS fix.")

    # 7) SMS
    hr_text = f"{bpm} BPM" if bpm is not None else "unavailable"
    loc_text = maps_link if maps_link else "location unavailable"
    alert_message = (
        f"NightSafe ALERT ({priority}): {urgency_label} distress detected. "
        f"Heart rate: {hr_text}. Location: {loc_text}"
    )
    print("Sending SMS alert via textbee...")
    sms_result = send_sms(EMERGENCY_CONTACT, alert_message)
    t7 = time.time()

    if sms_result:
        print(f"SMS sent: {sms_result}")
    else:
        print("SMS send failed.")

    # 8) Website: record the alert on the Alerts page
    if sio.connected:
        try:
            res = sio.call("alert", {
                "clientId": str(uuid.uuid4()),
                "transcript": text,
                "priority": priority,
                "bpm": float(bpm) if bpm is not None else None,
                "latitude": location["latitude"] if location else None,
                "longitude": location["longitude"] if location else None,
                "occurredAt": datetime.fromtimestamp(t0, tz=timezone.utc).isoformat(),
                "smsStatus": "sent" if sms_result else "failed",
                "notified": 1 if sms_result else 0,
            }, namespace="/device", timeout=5)
            print(f"Website alert: {res}")
        except Exception as e:
            print(f"Website alert failed: {e}")
    else:
        print("Website not connected; alert not recorded there.")

    print(
        f"\nTiming -- ASR: {t2 - t1:.2f}s | "
        f"Classify: {t4 - t2:.2f}s | HeartRate: {t5 - t4:.2f}s | "
        f"GPS: {t6 - t5:.2f}s | SMS: {t7 - t6:.2f}s | Total: {t7 - t0:.2f}s"
    )
    print("-" * 60)


# ---- Main loop ----
print("=== NightSafe: Full Pipeline (mic on LAPTOP -> ASR + Stage 1 + Stage 2 + Heart Rate + Priority + GPS + SMS) ===")
print(f"Listening for the laptop on port {LISTEN_PORT}. Press Ctrl+C to stop.\n")

try:
    while True:
        run_one_test()
except KeyboardInterrupt:
    print("\nStopped.")
finally:
    hr_stop.set()
    gps_stop.set()
    time.sleep(0.1)
    hr_spi.close()
    server.shutdown()
    if sio.connected:
        sio.disconnect()
