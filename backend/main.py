"""FastAPI application — WebSocket streaming endpoint and REST API.

Orchestrates audio capture, transcription, topic analysis, speaker
identification, and deferred mood scoring.  Streams results to connected
frontend clients over WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .audio_capture import DeviceAudioCapture, list_audio_devices
from .models import (
    AudioDeviceList,
    DeviceSelectRequest,
    InputMode,
    MoodVector,
    StatusMessage,
)
from .mood_analyzer import quick_mood, DeferredMoodAnalyzer
from .speaker_tracker import SpeakerTracker
from .topic_analyzer import TopicAnalyzer
from .transcriber import Transcriber

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(name)s %(levelname)s %(message)s")

# Quiet down noisy libs
logging.getLogger("uvicorn").setLevel(logging.INFO)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("spacy").setLevel(logging.WARNING)
logging.getLogger("vosk").setLevel(logging.WARNING)


# ── Shared state ────────────────────────────────────────────────

transcriber = Transcriber()
topic_analyzer = TopicAnalyzer()
speaker_tracker = SpeakerTracker()
device_capture: DeviceAudioCapture | None = None
connected_ws: set[WebSocket] = set()
input_mode = InputMode.browser

# Thread-safe queue bridging sync callbacks → async broadcast
# Using stdlib queue.Queue because asyncio.Queue is NOT thread-safe
# and _processing_loop + _on_mood_update run in worker threads.
_event_queue: queue.Queue[dict] = queue.Queue(maxsize=200)

# History of all broadcast events so new clients can catch up.
# Protected by a lock since the broadcast loop (async) and reset (async) access it.
_event_history: list[dict] = []
_history_lock = threading.Lock()

# Bounded queue: transcriber thread → processing thread
_segment_queue: queue.Queue = queue.Queue(maxsize=50)

# Reference to the running event loop (set in lifespan)
_loop: asyncio.AbstractEventLoop | None = None


def _on_mood_update(topic_id: str, mood: MoodVector) -> None:
    """Called from deferred mood analyzer when sentiment is ready."""
    logger.debug("[MOOD] deferred mood update for topic=%s", topic_id)
    try:
        _event_queue.put_nowait({
            "type": "topic_update",
            "id": topic_id,
            "mood": mood.model_dump(),
        })
    except queue.Full:
        logger.warning("[MOOD] event queue full, dropping mood update")


deferred_mood = DeferredMoodAnalyzer(
    gap_threshold_s=2.0,
    on_mood_update=_on_mood_update,
)


def _on_device_audio(audio: np.ndarray) -> None:
    """Called from sounddevice thread when device capture is active."""
    transcriber.feed_audio(audio)


def _on_transcript_segment(
    text: str, start: float, end: float, spk_vector: np.ndarray | None
) -> None:
    """Called from transcription thread — must be fast.
    Puts work onto the processing queue instead of running inline.
    """
    logger.debug("[TRANSCRIBER→QUEUE] segment: %r (%.2f-%.2f)", text[:60], start, end)
    try:
        _segment_queue.put_nowait((text, start, end, spk_vector))
    except queue.Full:
        logger.warning("[TRANSCRIBER→QUEUE] processing queue full, dropping segment")


_processing_running = False


def _processing_loop() -> None:
    """Separate thread: runs spaCy, speaker ID, mood on transcript segments."""
    global _processing_running
    _processing_running = True
    logger.info("[PROC] Processing loop started")

    while _processing_running:
        try:
            item = _segment_queue.get(timeout=0.5)
        except queue.Empty:
            continue

        text, start, end, spk_vector = item
        logger.debug("[PROC] got segment: %r (%.2f-%.2f)", text[:60], start, end)

        try:
            # Quick mood (lightweight)
            mood = quick_mood(text, start, end)
            logger.debug("[PROC] quick_mood done: energy=%.3f conf=%.3f", mood.energy, mood.confidence)

            # Speaker identification
            speaker_label, speaker_color = speaker_tracker.identify(spk_vector, text)
            logger.debug("[PROC] speaker: %s (%s)", speaker_label, speaker_color)

            # Topic analysis (spaCy — the expensive part)
            topic_event = topic_analyzer.process_segment(text, start, end)
            logger.debug("[PROC] topic_analyzer returned: %s", topic_event.get("type") if topic_event else None)

            # Enqueue transcript event
            transcript_msg = {
                "type": "transcript",
                "text": text,
                "start": round(start, 2),
                "end": round(end, 2),
                "topicId": topic_analyzer.active_id,
                "speaker": speaker_label,
                "speakerColor": speaker_color,
            }
            try:
                _event_queue.put_nowait(transcript_msg)
                logger.debug("[PROC→EVENT] enqueued transcript (qsize=%d)", _event_queue.qsize())
            except queue.Full:
                logger.warning("[PROC→EVENT] event queue full, dropping transcript")

            # Enqueue topic event if there was a shift/reconnect
            if topic_event:
                if topic_event["type"] == "topic":
                    topic_event["mood"] = mood.model_dump()
                    topic_event["speaker"] = speaker_label
                    topic_event["speakerColor"] = speaker_color
                try:
                    _event_queue.put_nowait(topic_event)
                    logger.debug("[PROC→EVENT] enqueued topic event type=%s", topic_event["type"])
                except queue.Full:
                    logger.warning("[PROC→EVENT] event queue full, dropping topic event")

            # Queue for deferred VADER analysis during silence gaps
            active_id = topic_analyzer.active_id
            if active_id:
                deferred_mood.enqueue(active_id, text, start, end)

        except Exception:
            logger.exception("[PROC] Error processing segment")

    logger.info("[PROC] Processing loop stopped")


# ── Lifespan ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global device_capture, _processing_running, _loop

    _loop = asyncio.get_running_loop()

    # Load models in background thread to not block startup
    def _load():
        transcriber.load_model()
        topic_analyzer.load_models()

    load_thread = threading.Thread(target=_load, daemon=True)
    load_thread.start()

    # Set up transcription callback
    transcriber.set_segment_callback(_on_transcript_segment)

    # Start processing worker thread (spaCy/speaker/mood off transcriber thread)
    proc_thread = threading.Thread(target=_processing_loop, daemon=True)
    proc_thread.start()

    # Init device capture (not started yet)
    device_capture = DeviceAudioCapture(on_audio=_on_device_audio)

    # Start deferred mood analyzer
    deferred_mood.start()

    # Start broadcast task
    broadcast_task = asyncio.create_task(_broadcast_loop())
    logger.info("[LIFESPAN] All systems started")

    yield

    # Cleanup
    broadcast_task.cancel()
    _processing_running = False
    transcriber.stop()
    deferred_mood.stop()
    if device_capture:
        device_capture.stop()
    logger.info("[LIFESPAN] Shutdown complete")


# ── App ─────────────────────────────────────────────────────────

app = FastAPI(title="HopTopiic", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Broadcast loop: drain queue → send to all WS clients ───────

async def _broadcast_loop():
    """Async loop that polls the thread-safe queue and broadcasts to WS clients."""
    logger.info("[BROADCAST] Broadcast loop started")
    while True:
        # Poll the thread-safe queue from the async event loop
        try:
            msg = _event_queue.get_nowait()
        except queue.Empty:
            await asyncio.sleep(0.05)  # 50ms poll interval
            continue

        # Save to history so late-joining clients can catch up
        with _history_lock:
            _event_history.append(msg)

        logger.debug("[BROADCAST] sending type=%s to %d clients", msg.get("type"), len(connected_ws))
        dead: set[WebSocket] = set()
        for ws in connected_ws:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.add(ws)
        connected_ws.difference_update(dead)


# ── REST endpoints ──────────────────────────────────────────────

@app.get("/api/audio-devices", response_model=AudioDeviceList)
async def get_audio_devices():
    return list_audio_devices()


@app.post("/api/audio-device/select")
async def select_audio_device(req: DeviceSelectRequest):
    global input_mode
    if device_capture is None:
        return {"error": "Device capture not initialized"}

    device_capture.start(req.deviceIndex)
    input_mode = InputMode.device
    transcriber.start()
    return {"status": "ok", "deviceIndex": req.deviceIndex}


@app.get("/api/status")
async def get_status():
    return StatusMessage(
        type="status",
        message="ready" if transcriber.is_loaded else "loading",
        modelLoaded=transcriber.is_loaded,
        inputMode=input_mode,
    )


# ── WebSocket endpoint ──────────────────────────────────────────

@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    global input_mode

    await ws.accept()
    connected_ws.add(ws)
    logger.info("[WS] Client connected (total=%d)", len(connected_ws))

    # Send initial status
    await ws.send_json(
        StatusMessage(
            type="status",
            message="connected",
            modelLoaded=transcriber.is_loaded,
            inputMode=input_mode,
        ).model_dump()
    )

    # Replay event history so late-joining viewers catch up
    with _history_lock:
        history_snapshot = list(_event_history)
    if history_snapshot:
        logger.info("[WS] Replaying %d events to new client", len(history_snapshot))
        for msg in history_snapshot:
            try:
                await ws.send_json(msg)
            except Exception:
                logger.warning("[WS] Failed to replay event to new client")
                break

    audio_chunk_count = 0

    try:
        while True:
            message = await ws.receive()

            if "bytes" in message and message["bytes"]:
                # Binary PCM float32 from browser mic — always accepted
                # regardless of input_mode so any remote client can
                # contribute audio from its own microphone.
                pcm = np.frombuffer(message["bytes"], dtype=np.float32)
                audio_chunk_count += 1
                if audio_chunk_count <= 3 or audio_chunk_count % 50 == 0:
                    logger.debug(
                        "[WS] audio chunk #%d: %d samples (%.3fs), buffer_total=%d, transcriber_running=%s",
                        audio_chunk_count, len(pcm), len(pcm) / 16000,
                        transcriber._chunk_total, transcriber._running,
                    )
                transcriber.feed_audio(pcm)
                if not transcriber._running:
                    logger.info("[WS] Starting transcriber (was stopped)")
                    transcriber.start()

            elif "text" in message and message["text"]:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                logger.debug("[WS] text message: type=%s", msg_type)

                if msg_type == "set_input":
                    mode = data.get("mode", "browser")
                    input_mode = InputMode(mode)

                    if input_mode == InputMode.device:
                        dev_idx = data.get("deviceIndex")
                        if dev_idx is not None and device_capture:
                            device_capture.start(dev_idx)
                            transcriber.start()
                    elif input_mode == InputMode.browser:
                        if device_capture:
                            device_capture.stop()

                    await ws.send_json({
                        "type": "status",
                        "message": f"input mode: {input_mode.value}",
                        "modelLoaded": transcriber.is_loaded,
                        "inputMode": input_mode.value,
                    })

                elif msg_type == "reset":
                    logger.info("[WS] Resetting session")
                    transcriber.reset()
                    topic_analyzer.reset()
                    speaker_tracker.reset()
                    deferred_mood.reset()
                    deferred_mood.start()
                    with _history_lock:
                        _event_history.clear()
                    audio_chunk_count = 0
                    await ws.send_json({"type": "status", "message": "session reset"})

                elif msg_type == "stop_recording":
                    logger.info("[WS] Stop recording")
                    transcriber.flush()
                    transcriber.stop()

                elif msg_type == "set_topic":
                    topic_text = data.get("topic", "").strip()
                    if topic_text:
                        logger.info("[WS] Setting initial topic: %r", topic_text[:80])
                        topic_event = topic_analyzer.set_initial_topic(topic_text)
                        if topic_event:
                            # Broadcast the pre-seeded root topic to all clients
                            try:
                                _event_queue.put_nowait(topic_event)
                            except queue.Full:
                                logger.warning("[WS] event queue full, dropping initial topic")
                            await ws.send_json({"type": "status", "message": f"topic set: {topic_text[:40]}"})
                        else:
                            await ws.send_json({"type": "error", "message": "Failed to set topic (model not ready?)"})
                    else:
                        await ws.send_json({"type": "error", "message": "Empty topic text"})

    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        connected_ws.discard(ws)
        logger.info("[WS] Client disconnected (remaining=%d)", len(connected_ws))


# ── Static frontend serving (production / Docker) ──────────────

_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
    logger.info("[STATIC] Serving frontend from %s", _FRONTEND_DIST)
