"""
Run this on your LAPTOP. It records from the laptop's mic (your Boya mic)
and sends each recording to the Raspberry Pi running:
    python3 nightsafe_debug.py --listen

Usage:
    pip install sounddevice scipy numpy requests
    python3 laptop_mic.py <PI_IP_ADDRESS>

Find the Pi's IP by running this ON THE PI:   hostname -I
Both devices must be on the same Wi-Fi / network.
"""
import io
import sys
import numpy as np
import requests
import sounddevice as sd
from scipy.io.wavfile import write

DURATION = 5
SAMPLE_RATES = [16000, 44100, 48000]
PORT = 8000

if len(sys.argv) < 2:
    print("Usage: python3 laptop_mic.py <PI_IP_ADDRESS>")
    sys.exit(1)
URL = f"http://{sys.argv[1]}:{PORT}/"


def pick_rate():
    for fs in SAMPLE_RATES:
        try:
            sd.check_input_settings(channels=1, samplerate=fs)
            return fs
        except Exception:
            continue
    raise RuntimeError("Laptop mic rejected all sample rates.")


fs = pick_rate()
print(f"Using mic: {sd.query_devices(kind='input')['name']}  at {fs} Hz")
print(f"Sending to: {URL}")
print("Tip: pick your Boya mic as the laptop's input device in system sound settings.\n")

while True:
    try:
        input("Press Enter, then speak for 5 seconds (Ctrl+C to quit)...")
    except KeyboardInterrupt:
        print("\nStopped.")
        break

    print("Recording... SPEAK NOW.")
    rec = sd.rec(int(DURATION * fs), samplerate=fs, channels=1, dtype="int16")
    sd.wait()
    mono = rec[:, 0]
    peak = int(np.abs(mono).max())
    print(f"Done. Peak level: {peak}", end="  ")
    if peak < 300:
        print("-> too quiet! Check the laptop's input device / volume and try again.")
        continue
    print("-> OK")

    buf = io.BytesIO()
    write(buf, fs, mono)
    try:
        r = requests.post(URL, data=buf.getvalue(), timeout=10)
        print(f"Sent to Pi ({r.status_code}). Watch the Pi's terminal for the result.\n")
    except requests.RequestException as e:
        print(f"!! Could not reach the Pi: {e}")
        print("   Check the IP, that the Pi script is running with --listen, and same network.\n")
