"""Pydantic models for all WebSocket and API message types."""

from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


# ── Mood / Style ─────────────────────────────────────────────────

class MoodVector(BaseModel):
    energy: float = Field(0.5, ge=0.0, le=1.0, description="0=calm, 1=energetic")
    confidence: float = Field(0.5, ge=0.0, le=1.0, description="0=hesitant, 1=confident")


# ── WebSocket inbound (client → server) ─────────────────────────

class InputMode(str, Enum):
    browser = "browser"
    device = "device"


class SetInputMessage(BaseModel):
    type: str = "set_input"
    mode: InputMode
    deviceIndex: int | None = None


class ControlMessage(BaseModel):
    type: str  # "start", "stop", "set_input"


# ── WebSocket outbound (server → client) ─────────────────────────

class TranscriptSegment(BaseModel):
    type: str = "transcript"
    text: str
    start: float
    end: float
    topicId: str | None = None
    speaker: str | None = None
    speakerColor: str | None = None


class TopicEvent(BaseModel):
    type: str = "topic"
    id: str
    label: str
    timestamp: float
    parentId: str | None = None
    hopDepth: int = 0
    semanticDistFromRoot: float = 0.0
    mood: MoodVector = Field(default_factory=MoodVector)
    speaker: str | None = None
    speakerColor: str | None = None


class TopicReconnectEvent(BaseModel):
    type: str = "reconnect"
    fromTopicId: str
    toTopicId: str
    timestamp: float


class TopicUpdateEvent(BaseModel):
    type: str = "topic_update"
    id: str
    label: str | None = None
    mood: MoodVector | None = None
    endTimestamp: float | None = None


class StatusMessage(BaseModel):
    type: str = "status"
    message: str
    modelLoaded: bool = False
    inputMode: InputMode = InputMode.browser


class ErrorMessage(BaseModel):
    type: str = "error"
    message: str


# ── REST API models ──────────────────────────────────────────────

class AudioDevice(BaseModel):
    index: int
    name: str
    maxInputChannels: int
    defaultSampleRate: float
    hostApi: str


class AudioDeviceList(BaseModel):
    devices: list[AudioDevice]
    defaultDevice: int | None = None


class DeviceSelectRequest(BaseModel):
    deviceIndex: int
