// ── Mood / Style ──────────────────────────────────────────────

export interface MoodVector {
  energy: number; // 0 = calm, 1 = energetic
  confidence: number; // 0 = hesitant, 1 = confident
}

// ── Topic Tree ────────────────────────────────────────────────

export interface SpeakerInfo {
  label: string;
  color: string;
}

export interface TopicNode {
  id: string;
  label: string;
  timestamp: number; // start time in seconds
  endTimestamp?: number;
  parentId: string | null;
  hopDepth: number;
  semanticDistFromRoot: number;
  mood: MoodVector;
  segments: TranscriptSegment[];
  speaker?: string;
  speakerColor?: string;
  /** All speakers who contributed to this topic (derived from segments). */
  speakers: SpeakerInfo[];
}

export interface TopicEdge {
  id: string;
  source: string;
  target: string;
  type: "branch" | "return";
  timestamp: number;
}

// ── Transcript ────────────────────────────────────────────────

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  topicId: string | null;
  speaker?: string;
  speakerColor?: string;
}

// ── WebSocket Messages (server → client) ──────────────────────

export interface TranscriptMessage {
  type: "transcript";
  text: string;
  start: number;
  end: number;
  topicId: string | null;
  speaker?: string;
  speakerColor?: string;
}

export interface TopicMessage {
  type: "topic";
  id: string;
  label: string;
  timestamp: number;
  parentId: string | null;
  hopDepth: number;
  semanticDistFromRoot: number;
  mood: MoodVector;
  speaker?: string;
  speakerColor?: string;
}

export interface ReconnectMessage {
  type: "reconnect";
  fromTopicId: string;
  toTopicId: string;
  timestamp: number;
}

export interface TopicUpdateMessage {
  type: "topic_update";
  id: string;
  label?: string;
  mood?: MoodVector;
  endTimestamp?: number;
}

export interface StatusMessage {
  type: "status";
  message: string;
  modelLoaded: boolean;
  inputMode: "browser" | "device";
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage =
  | TranscriptMessage
  | TopicMessage
  | ReconnectMessage
  | TopicUpdateMessage
  | StatusMessage
  | ErrorMessage;

// ── WebSocket Messages (client → server) ──────────────────────

export interface SetInputMessage {
  type: "set_input";
  mode: "browser" | "device";
  deviceIndex?: number;
}

export interface ResetMessage {
  type: "reset";
}

export interface StopRecordingMessage {
  type: "stop_recording";
}

export interface SetTopicMessage {
  type: "set_topic";
  topic: string;
}

export type ClientMessage = SetInputMessage | ResetMessage | StopRecordingMessage | SetTopicMessage;

// ── Audio Devices ─────────────────────────────────────────────

export interface AudioDevice {
  index: number;
  name: string;
  maxInputChannels: number;
  defaultSampleRate: number;
  hostApi: string;
}

export interface AudioDeviceList {
  devices: AudioDevice[];
  defaultDevice: number | null;
}

// ── Layout ────────────────────────────────────────────────────

export interface LayoutConfig {
  pixelsPerSecond: number;
  baseYStep: number;
  semanticStretch: number;
  padding: { top: number; left: number };
}
