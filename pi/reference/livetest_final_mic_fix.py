import sounddevice as sd
from scipy.io.wavfile import write
import numpy as np
import time
import serial
import requests
import spidev
import subprocess
from scipy.signal import butter, sosfiltfilt, find_peaks
from faster_whisper import WhisperModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# =========================================================
# EDIT THESE TO MATCH YOUR PI'S FILE SYSTEM / CREDENTIALS
# =========================================================
ASR_MODEL_PATH = "/home/nightsafe/nightsafe/bangla_whisper_ct2"
STAGE1_MODEL_PATH = "/home/nightsafe/nightsafe/models/stage1/nightsafe_stage1_final"
STAGE2_MODEL_PATH = "/home/nightsafe/nightsafe/models/stage2/nightsafe_stage2_final"
GPS_PORT = "/dev/ttyAMA0"

TEXTBEE_DEVICE_ID = "REDACTED"
TEXTBEE_API_KEY = "REDACTED"
EMERGENCY_CONTACT = "REDACTED"

MIC_CARD = "2"  # Boya mic ALSA card index
# =========================================================

RECORD_DURATION = 5
SAMPLE_RATE = 44100
TEMP_AUDIO_FILE = "live_test.wav"
GPS_BAUD_RATE = 9600

# ---- Heart rate (DFRobot SEN0213 + MCP3008) settings ----
HR_SAMPLE_RATE = 250          # ECG samples per second
HR_MEASURE_DURATION = 8       # seconds to sample when fetching heart rate
ADC_CHANNEL = 0
ADC_VREF = 3.3

HR_SPI_BUS = 0                # MCP3008 enumerates as /dev/spidev10.0 on this Pi
HR_SPI_DEVICE = 0              # CE0
HR_SPI_SPEED = 1_000_000

# Filter used for R-peak detection
HR_PEAK_LOW = 5.0
HR_PEAK_HIGH = 20.0

# Minimum distance between two detected R peaks.
# 0.25 sec = maximum theoretical 240 BPM.
HR_MIN_PEAK_DISTANCE = int(HR_SAMPLE_RATE * 0.25)

# ---- Priority decision settings ----
# Heart rate this high or above is treated as "elevated" (tachycardic / stress response)
BPM_ELEVATED_THRESHOLD = 100.0


# ---------------- 0) Mic auto-gain setup ----------------
def setup_mic_gain():
    """Ensure mic gain settings are correct on every run — no manual alsamixer needed."""
    commands = [
        ['amixer', '-c', MIC_CARD, 'set', 'Mic Capture Switch', 'on'],
        ['amixer', '-c', MIC_CARD, 'set', 'Mic Capture Volume', '28'],
        ['amixer', '-c', MIC_CARD, 'set', 'Auto Gain Control', 'on'],
    ]
    for cmd in commands:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Warning: mic gain command failed: {' '.join(cmd)} -> {result.stderr.strip()}")


print("Setting mic gain...")
setup_mic_gain()

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

print("All models and sensors loaded. Ready.\n")


# ---------------- 1) Audio -> Text ----------------
def record_audio(filename, duration=RECORD_DURATION, fs=SAMPLE_RATE):
    """Records audio from the default mic (Boya mic) and saves as mono WAV."""
    print(f"Recording {duration}s... speak now.")
    recording = sd.rec(int(duration * fs), samplerate=fs, channels=2, dtype='int16')
    sd.wait()
    mono = recording.mean(axis=1).astype(np.int16)
    write(filename, fs, mono)
    return filename


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
    """Samples the SEN0213 for `duration` seconds and returns BPM, or None."""
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


# ---------------- 3b) Priority decision ----------------
def decide_priority(bpm):
    """
    Only called when urgency_result == 1 (urgent), since that's the only
    case where an alert is sent now.

    - elevated/unknown bpm (>= BPM_ELEVATED_THRESHOLD or None) -> HIGH
    - normal bpm (< BPM_ELEVATED_THRESHOLD)                    -> MEDIUM
    """
    elevated = (bpm is None) or (bpm >= BPM_ELEVATED_THRESHOLD)
    return "HIGH" if elevated else "MEDIUM"


# ---------------- 4) GPS ----------------
def send_at_gps(ser, command, wait=1):
    ser.write((command + "\r\n").encode())
    time.sleep(wait)
    response = ser.read(ser.in_waiting or 1).decode(errors='replace')
    return response


def nmea_to_decimal(raw_value, is_longitude=False):
    raw_value = float(raw_value)
    degrees = int(raw_value // 100)
    minutes = raw_value - (degrees * 100)
    decimal = degrees + (minutes / 60)
    return round(decimal, 6)


def get_gps_coordinates():
    """Returns {'latitude': .., 'longitude': ..} or None if no fix / error."""
    try:
        ser = serial.Serial(GPS_PORT, baudrate=GPS_BAUD_RATE, timeout=1)
    except serial.SerialException as e:
        print(f"GPS serial port error: {e}")
        return None

    send_at_gps(ser, "AT+CGPSPWR=1")
    status = send_at_gps(ser, "AT+CGPSSTATUS?")

    if "3D Fix" not in status and "2D Fix" not in status:
        ser.close()
        return None

    raw = send_at_gps(ser, "AT+CGPSINF=0")
    ser.close()

    try:
        data_line = [line for line in raw.split("\n") if line.strip().startswith("+CGPSINF:")][0]
        fields = data_line.split(":")[1].strip().split(",")
        latitude = nmea_to_decimal(fields[1], is_longitude=False)
        longitude = nmea_to_decimal(fields[2], is_longitude=True)
        return {"latitude": latitude, "longitude": longitude}
    except (IndexError, ValueError):
        return None


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
    """Full pipeline: record -> transcribe -> distress -> urgency -> (only if urgent) heart rate -> priority -> GPS -> SMS.

    SMS is sent ONLY when distress == 1 AND urgency == 1 (urgent).
    Non-urgent distress is logged but does NOT send an alert.
    """
    t0 = time.time()

    # 1) Mic -> text
    audio_file = record_audio(TEMP_AUDIO_FILE)
    t1 = time.time()
    text = transcribe(audio_file)
    t2 = time.time()
    print(f"\nTranscribed text: {text}")

    # 2) Distress
    distress_result = predict_distress(text)
    t3 = time.time()

    if distress_result == 0:
        print("Stage 1: NON-DISTRESS")
        print("-> No alert would be triggered.")
        print(f"\nTiming -- Record: {t1 - t0:.2f}s | ASR: {t2 - t1:.2f}s | Classify: {t3 - t2:.2f}s | Total: {t3 - t0:.2f}s")
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
        print(f"\nTiming -- Record: {t1 - t0:.2f}s | ASR: {t2 - t1:.2f}s | Classify: {t4 - t2:.2f}s | Total: {t4 - t0:.2f}s")
        print("-" * 60)
        return

    # ---- From here on, only reached when distress AND urgent ----

    # 4) Heart rate
    print(f"Measuring heart rate ({HR_MEASURE_DURATION}s, please stay still)...")
    bpm = get_heart_rate()
    t5 = time.time()
    if bpm is not None:
        print(f"Heart rate: {bpm} BPM")
    else:
        print("Heart rate: unavailable.")

    # 5) Priority (urgent-only now, so just based on BPM)
    priority = decide_priority(bpm)
    print(f"-> Alert WOULD be triggered. Priority: {priority}")

    # 6) GPS
    print("Fetching GPS location...")
    location = get_gps_coordinates()
    t6 = time.time()

    maps_link = None
    if location:
        maps_link = f"https://maps.google.com/?q={location['latitude']},{location['longitude']}"
        print(f"Location: {location['latitude']}, {location['longitude']}")
        print(f"Maps link: {maps_link}")
    else:
        print("Could not get GPS fix.")

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

    print(
        f"\nTiming -- Record: {t1 - t0:.2f}s | ASR: {t2 - t1:.2f}s | "
        f"Classify: {t4 - t2:.2f}s | HeartRate: {t5 - t4:.2f}s | "
        f"GPS: {t6 - t5:.2f}s | SMS: {t7 - t6:.2f}s | Total: {t7 - t0:.2f}s"
    )
    print("-" * 60)


# ---- Main loop ----
print("=== NightSafe: Full Pipeline Live Test (ASR + Stage 1 + Stage 2 + Heart Rate + Priority + GPS + SMS) ===")
print("Press Ctrl+C to stop.\n")

try:
    while True:
        input("Press Enter, then speak within 5 seconds...")
        run_one_test()
except KeyboardInterrupt:
    print("\nStopped.")
finally:
    hr_spi.close()
