/**
 * Provider abstraction layer for pluggable STT, speaker detection, and event export.
 * Enables switching between backend-driven (WebSocket) and frontend-only (Web Speech API) modes.
 */

import type { TranscriptMessage, TopicMessage, ReconnectMessage, TopicUpdateMessage } from "./types";

/**
 * Transcription provider: converts audio chunks to transcript segments.
 */
export interface TranscriberProvider {
  /** Start transcription session. */
  start(): Promise<void>;
  
  /** Stop transcription session and cleanup. */
  stop(): Promise<void>;
  
  /** Process raw audio PCM data. Returns immediately; emits results via onTranscript. */
  processAudio(pcm: ArrayBuffer): void;
  
  /** Called when a transcript segment becomes available. */
  onTranscript?: (msg: TranscriptMessage) => void;
  
  /** Called when an error occurs. */
  onError?: (err: Error) => void;
}

/**
 * Speaker detection provider: identifies speaker labels and colors.
 */
export interface SpeakerProvider {
  /** Start speaker session. */
  start(): Promise<void>;
  
  /** Stop speaker session. */
  stop(): Promise<void>;
  
  /** Process audio chunk for speaker detection. Emits via onSpeakerUpdate. */
  processAudio(pcm: ArrayBuffer): void;
  
  /** Called when speaker changes. */
  onSpeakerUpdate?: (speaker: string, color: string) => void;
  
  /** Called when an error occurs. */
  onError?: (err: Error) => void;
}

/**
 * Event sink: persists or exports transcript events.
 */
export interface EventSink {
  /** Start event collection. */
  start(): Promise<void>;
  
  /** Stop event collection. */
  stop(): Promise<void>;
  
  /** Add a transcript event. */
  addTranscript(msg: TranscriptMessage): void;
  
  /** Add a topic event. */
  addTopic(msg: TopicMessage): void;
  
  /** Add a reconnect event. */
  addReconnect(msg: ReconnectMessage): void;
  
  /** Add a topic update event. */
  updateTopic(msg: TopicUpdateMessage): void;
  
  /** Export events as NDJSON or JSON string. Format: "ndjson" or "json". */
  export(format: "ndjson" | "json"): string;
  
  /** Reset all collected events. */
  reset(): void;
}

/**
 * In-memory event sink for Local Mode: stores events and exports as NDJSON/JSON.
 */
export class MemoryEventSink implements EventSink {
  private events: Array<{
    type: string;
    timestamp: number;
    data: any;
  }> = [];

  async start(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    // No-op
  }

  addTranscript(msg: TranscriptMessage): void {
    this.events.push({
      type: "transcript",
      timestamp: Date.now(),
      data: msg,
    });
  }

  addTopic(msg: TopicMessage): void {
    this.events.push({
      type: "topic",
      timestamp: Date.now(),
      data: msg,
    });
  }

  addReconnect(msg: ReconnectMessage): void {
    this.events.push({
      type: "reconnect",
      timestamp: Date.now(),
      data: msg,
    });
  }

  updateTopic(msg: TopicUpdateMessage): void {
    this.events.push({
      type: "topic_update",
      timestamp: Date.now(),
      data: msg,
    });
  }

  export(format: "ndjson" | "json"): string {
    if (format === "ndjson") {
      return this.events.map((e) => JSON.stringify(e)).join("\n");
    } else {
      return JSON.stringify(this.events, null, 2);
    }
  }

  reset(): void {
    this.events = [];
  }
}
