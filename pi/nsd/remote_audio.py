from __future__ import annotations

import io
import logging
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import gcd
from typing import Optional, Tuple

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

logger = logging.getLogger(__name__)

TARGET_RATE = 16000
MAX_BODY = 5 * 1024 * 1024


def wav_bytes_to_float32(data: bytes) -> np.ndarray:
    """Decode WAV bytes to mono float32 at 16 kHz."""
    rate, samples = wavfile.read(io.BytesIO(data))
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if samples.dtype == np.int16:
        x = samples.astype(np.float32) / 32768.0
    elif samples.dtype == np.int32:
        x = samples.astype(np.float32) / 2147483648.0
    elif samples.dtype == np.uint8:
        x = (samples.astype(np.float32) - 128.0) / 128.0
    else:
        x = samples.astype(np.float32)
    if rate != TARGET_RATE:
        g = gcd(int(rate), TARGET_RATE)
        x = resample_poly(x, TARGET_RATE // g, int(rate) // g).astype(np.float32)
    return x


class RemoteAudioReceiver:
    """Accepts WAV POSTs from laptop_mic.py and queues (float32_16k, capture_time)."""

    def __init__(self, output_queue: "queue.Queue[Tuple[np.ndarray, float]]", port: int = 8000) -> None:
        self.output_queue = output_queue
        self.port = port
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                try:
                    n = int(self.headers.get("Content-Length", 0))
                    if n <= 0 or n > MAX_BODY:
                        self.send_response(413)
                        self.end_headers()
                        return
                    audio = wav_bytes_to_float32(self.rfile.read(n))
                    if outer.output_queue.full():
                        try:
                            outer.output_queue.get_nowait()
                            logger.warning("Audio queue full; dropped oldest utterance.")
                        except queue.Empty:
                            pass
                    outer.output_queue.put_nowait((audio, time.time()))
                    logger.info("Remote audio received: %.2fs", len(audio) / TARGET_RATE)
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"OK")
                except Exception as e:
                    logger.warning("Remote audio rejected: %s", e)
                    self.send_response(400)
                    self.end_headers()

            def log_message(self, *args) -> None:
                pass

        return Handler

    def start(self) -> None:
        self._server = ThreadingHTTPServer(("0.0.0.0", self.port), self._make_handler())
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True, name="RemoteAudio")
        self._thread.start()
        logger.info("Remote audio receiver listening on port %d.", self.port)

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()