"""Vosk-based real-time transcription with speaker vectors.

Accumulates raw PCM float32 audio and runs Vosk recognition on a streaming
basis, emitting transcript segments with optional speaker embeddings.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import zipfile
from collections import deque
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000
# How many bytes of audio to feed Vosk per cycle (0.5s chunks)
CHUNK_DURATION_S = 0.5
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION_S)
# Max audio to buffer before dropping old data (10 seconds)
MAX_BUFFER_SAMPLES = SAMPLE_RATE * 10

# Model directory (downloaded on first run)
MODEL_DIR = Path(__file__).parent / "models"
MODEL_NAME = "vosk-model-small-en-us-0.15"
SPK_MODEL_NAME = "vosk-model-spk-0.4"


def _download_model(name: str, dest: Path) -> Path:
    """Download and extract a Vosk model if not already present."""
    model_path = dest / name
    if model_path.exists():
        return model_path

    dest.mkdir(parents=True, exist_ok=True)

    import urllib.request

    url = f"https://alphacephei.com/vosk/models/{name}.zip"
    zip_path = dest / f"{name}.zip"

    logger.info("Downloading Vosk model: %s", url)
    urllib.request.urlretrieve(url, zip_path)

    logger.info("Extracting model to %s", dest)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest)
    zip_path.unlink()

    return model_path


class Transcriber:
    """Wraps Vosk for streaming transcription with speaker identification."""

    def __init__(self) -> None:
        self._model: Any = None
        self._spk_model: Any = None
        self._recognizer: Any = None
        self._loaded = False

        # Audio buffer: deque of float32 arrays (avoids O(n) concatenate)
        self._chunks: deque[np.ndarray] = deque()
        self._chunk_total: int = 0  # total samples across all chunks
        self._buffer_lock = threading.Lock()

        self._total_audio_s: float = 0.0
        self._on_segment: Callable[..., Any] | None = None
        self._running = False
        self._thread: threading.Thread | None = None

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load_model(self) -> None:
        """Download (if needed) and load Vosk + speaker model."""
        from vosk import Model, SpkModel, KaldiRecognizer, SetLogLevel

        SetLogLevel(-1)  # suppress Vosk's own logs

        model_path = _download_model(MODEL_NAME, MODEL_DIR)
        logger.info("Loading Vosk model from %s", model_path)
        self._model = Model(str(model_path))

        # Speaker model (optional, for diarization)
        try:
            spk_path = _download_model(SPK_MODEL_NAME, MODEL_DIR)
            logger.info("Loading Vosk speaker model from %s", spk_path)
            self._spk_model = SpkModel(str(spk_path))
        except Exception as e:
            logger.warning("Speaker model not available: %s", e)
            self._spk_model = None

        self._init_recognizer()
        self._loaded = True
        logger.info("Vosk models loaded")

    def _init_recognizer(self) -> None:
        """Create a fresh KaldiRecognizer."""
        from vosk import KaldiRecognizer

        if self._spk_model:
            self._recognizer = KaldiRecognizer(
                self._model, SAMPLE_RATE, self._spk_model
            )
        else:
            self._recognizer = KaldiRecognizer(self._model, SAMPLE_RATE)
        self._recognizer.SetWords(True)

    def set_segment_callback(self, cb: Callable[..., Any]) -> None:
        """Register callback: cb(text, start_s, end_s, spk_vector)."""
        self._on_segment = cb

    def feed_audio(self, pcm_f32: np.ndarray) -> None:
        """Append raw PCM float32 mono audio to the buffer."""
        with self._buffer_lock:
            self._chunks.append(pcm_f32)
            self._chunk_total += len(pcm_f32)
            # Cap buffer: drop oldest chunks if over limit
            dropped_count = 0
            while self._chunk_total > MAX_BUFFER_SAMPLES and self._chunks:
                dropped = self._chunks.popleft()
                self._chunk_total -= len(dropped)
                dropped_count += 1
            if dropped_count:
                logger.debug("[FEED] dropped %d old chunks (buffer at %d samples)", dropped_count, self._chunk_total)

    def start(self) -> None:
        if self._running:
            return
        logger.info("[TRANSCRIBER] Starting transcription loop")
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        logger.info("[TRANSCRIBER] Stopping (was running=%s)", self._running)
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def reset(self) -> None:
        self.stop()
        with self._buffer_lock:
            self._chunks.clear()
            self._chunk_total = 0
        self._total_audio_s = 0.0
        if self._model:
            self._init_recognizer()

    def _drain_buffer(self, n: int) -> np.ndarray | None:
        """Extract exactly n samples from the chunk deque. Returns None if not enough."""
        if self._chunk_total < n:
            return None
        parts: list[np.ndarray] = []
        remaining = n
        while remaining > 0 and self._chunks:
            chunk = self._chunks[0]
            if len(chunk) <= remaining:
                parts.append(self._chunks.popleft())
                self._chunk_total -= len(chunk)
                remaining -= len(chunk)
            else:
                parts.append(chunk[:remaining])
                self._chunks[0] = chunk[remaining:]
                self._chunk_total -= remaining
                remaining = 0
        return np.concatenate(parts) if parts else None

    def _loop(self) -> None:
        logger.info("[TRANSCRIBER] Transcription loop entered (running=%s, loaded=%s)", self._running, self._loaded)
        loop_cycles = 0
        while self._running:
            chunk = None
            with self._buffer_lock:
                chunk = self._drain_buffer(CHUNK_SAMPLES)

            if chunk is not None:
                loop_cycles += 1
                if loop_cycles <= 5 or loop_cycles % 20 == 0:
                    logger.debug("[TRANSCRIBER] _loop cycle #%d: processing %d samples (total_audio=%.2fs)",
                                 loop_cycles, len(chunk), self._total_audio_s)
                self._process_chunk(chunk)
            else:
                time.sleep(0.1)
        logger.info("[TRANSCRIBER] Transcription loop exited after %d cycles", loop_cycles)

    def _process_chunk(self, audio_f32: np.ndarray) -> None:
        """Feed chunk to Vosk and emit segments on final results."""
        if self._recognizer is None:
            logger.warning("[TRANSCRIBER] _process_chunk called but recognizer is None")
            return

        # Vosk wants int16 PCM bytes
        audio_i16 = (audio_f32 * 32767).astype(np.int16).tobytes()
        chunk_duration = len(audio_f32) / SAMPLE_RATE

        is_final = self._recognizer.AcceptWaveform(audio_i16)
        if is_final:
            result = json.loads(self._recognizer.Result())
            logger.debug("[TRANSCRIBER] Vosk FINAL result: %s", result.get("text", "")[:80])
            self._emit_result(result)

        self._total_audio_s += chunk_duration

    def _emit_result(self, result: dict) -> None:
        """Parse Vosk result JSON and emit callback."""
        text = result.get("text", "").strip()
        if not text:
            logger.debug("[TRANSCRIBER] _emit_result: empty text, skipping")
            return

        # Extract word-level timing if available
        words = result.get("result", [])
        if words:
            start = self._total_audio_s + words[0].get("start", 0)
            end = self._total_audio_s + words[-1].get("end", 0)
        else:
            start = self._total_audio_s
            end = self._total_audio_s

        # Speaker vector (128-dim from Vosk spk model)
        spk_vector = None
        if "spk" in result:
            spk_vector = np.array(result["spk"], dtype=np.float32)
            logger.debug("[TRANSCRIBER] speaker vector present (dim=%d)", len(spk_vector))

        logger.info("[TRANSCRIBER] EMIT segment: %r (%.2f-%.2f) has_callback=%s",
                    text[:60], start, end, self._on_segment is not None)
        if self._on_segment:
            self._on_segment(text, start, end, spk_vector)

    def flush(self) -> None:
        """Flush any remaining audio in recognizer (call during silence gaps)."""
        if self._recognizer is None:
            return
        result = json.loads(self._recognizer.FinalResult())
        self._emit_result(result)
