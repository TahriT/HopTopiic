"""System audio device capture using sounddevice.

Provides device enumeration and background audio capture from any system
audio input device (microphones, virtual cables, loopback devices).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

import numpy as np
import sounddevice as sd

from .models import AudioDevice, AudioDeviceList

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000  # 16 kHz mono – what Whisper expects
CHANNELS = 1
BLOCK_DURATION_S = 1.0  # send 1-second chunks
BLOCK_SIZE = int(SAMPLE_RATE * BLOCK_DURATION_S)


def list_audio_devices() -> AudioDeviceList:
    """Return all input-capable audio devices on the system."""
    devices: list[AudioDevice] = []
    host_apis = sd.query_hostapis()

    for info in sd.query_devices():
        if info["max_input_channels"] < 1:
            continue
        api_name = host_apis[info["hostapi"]]["name"] if info["hostapi"] < len(host_apis) else "unknown"
        devices.append(
            AudioDevice(
                index=info["index"],
                name=info["name"],
                maxInputChannels=info["max_input_channels"],
                defaultSampleRate=info["default_samplerate"],
                hostApi=api_name,
            )
        )

    default_idx: int | None = None
    try:
        default_idx = sd.query_devices(kind="input")["index"]
    except Exception:
        pass

    return AudioDeviceList(devices=devices, defaultDevice=default_idx)


class DeviceAudioCapture:
    """Captures audio from a system device in a background thread."""

    def __init__(self, on_audio: Callable[[np.ndarray], Any]) -> None:
        self._on_audio = on_audio
        self._stream: sd.InputStream | None = None
        self._lock = threading.Lock()
        self._device_index: int | None = None

    @property
    def is_active(self) -> bool:
        return self._stream is not None and self._stream.active

    def start(self, device_index: int) -> None:
        """Start capturing from the given device."""
        self.stop()
        with self._lock:
            self._device_index = device_index
            logger.info("Starting device capture: device=%s, sr=%s", device_index, SAMPLE_RATE)
            self._stream = sd.InputStream(
                device=device_index,
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                blocksize=BLOCK_SIZE,
                callback=self._audio_callback,
            )
            self._stream.start()

    def stop(self) -> None:
        """Stop the current capture stream."""
        with self._lock:
            if self._stream is not None:
                try:
                    self._stream.stop()
                    self._stream.close()
                except Exception:
                    pass
                self._stream = None
                logger.info("Stopped device capture")

    def _audio_callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: Any,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            logger.warning("sounddevice status: %s", status)
        # indata shape: (frames, channels) – squeeze to 1-D float32
        audio = indata[:, 0].copy()
        self._on_audio(audio)
