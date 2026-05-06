"""Stream audio from a media URL (YouTube, etc.) via yt-dlp + ffmpeg.

Extracts audio as 16 kHz mono PCM float32 and feeds it into the
transcription pipeline in real-time chunks.
"""

from __future__ import annotations

import logging
import subprocess
import threading
import time
from typing import Callable

import numpy as np

logger = logging.getLogger(__name__)

# Chunk size: 0.5s at 16 kHz
CHUNK_SAMPLES = 8000
SAMPLE_RATE = 16000


class MediaStreamer:
    """Downloads and streams audio from a URL through the transcriber."""

    def __init__(self, on_audio: Callable[[np.ndarray], None]):
        self._on_audio = on_audio
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._process: subprocess.Popen | None = None
        self._active_url: str | None = None

    @property
    def is_active(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def active_url(self) -> str | None:
        return self._active_url if self.is_active else None

    def start(self, url: str) -> None:
        """Start streaming audio from the given URL."""
        self.stop()  # Stop any existing stream
        self._stop_event.clear()
        self._active_url = url
        self._thread = threading.Thread(target=self._stream_loop, args=(url,), daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the current stream."""
        self._stop_event.set()
        if self._process:
            try:
                self._process.kill()
            except Exception:
                pass
            self._process = None
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        self._active_url = None

    def _stream_loop(self, url: str) -> None:
        """Worker thread: yt-dlp → ffmpeg → PCM chunks → callback."""
        logger.info("[MEDIA] Starting stream from %s", url)
        ytdlp_proc: subprocess.Popen | None = None
        ffmpeg_proc: subprocess.Popen | None = None

        try:
            # yt-dlp outputs audio to stdout, ffmpeg converts to raw PCM
            # Pipeline: yt-dlp -o - URL | ffmpeg -i pipe:0 -f f32le -ar 16000 -ac 1 pipe:1
            ytdlp_cmd = [
                "yt-dlp",
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                "-f", "bestaudio/best",
                "-o", "-",
                url,
            ]

            ffmpeg_cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel", "error",
                "-i", "pipe:0",
                "-f", "f32le",
                "-ar", str(SAMPLE_RATE),
                "-ac", "1",
                "pipe:1",
            ]

            logger.debug("[MEDIA] yt-dlp cmd: %s", " ".join(ytdlp_cmd))

            ytdlp_proc = subprocess.Popen(
                ytdlp_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            ffmpeg_proc = subprocess.Popen(
                ffmpeg_cmd,
                stdin=ytdlp_proc.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            # Allow yt-dlp to receive SIGPIPE if ffmpeg exits
            if ytdlp_proc.stdout:
                ytdlp_proc.stdout.close()

            self._process = ffmpeg_proc
            if ffmpeg_proc.stdout is None:
                raise RuntimeError("ffmpeg stdout is not available")

            bytes_per_chunk = CHUNK_SAMPLES * 4  # float32 = 4 bytes
            chunk_duration = CHUNK_SAMPLES / SAMPLE_RATE

            while not self._stop_event.is_set():
                raw = ffmpeg_proc.stdout.read(bytes_per_chunk)
                if not raw:
                    break  # EOF

                if len(raw) % 4 != 0:
                    raw = raw[: len(raw) - (len(raw) % 4)]
                    if not raw:
                        continue

                pcm = np.frombuffer(raw, dtype=np.float32)
                self._on_audio(pcm)

                # Pace to roughly real-time so the transcriber isn't overwhelmed
                time.sleep(chunk_duration * 0.8)

            logger.info("[MEDIA] Stream ended for %s", url)

        except FileNotFoundError as e:
            logger.error("[MEDIA] Required tool not found: %s. Install yt-dlp and ffmpeg.", e)
        except Exception:
            logger.exception("[MEDIA] Error streaming from %s", url)
        finally:
            self._active_url = None
            if self._process:
                try:
                    self._process.kill()
                except Exception:
                    pass
                self._process = None
            if ffmpeg_proc:
                try:
                    ffmpeg_proc.kill()
                except Exception:
                    pass
            if ytdlp_proc:
                try:
                    ytdlp_proc.kill()
                except Exception:
                    pass
