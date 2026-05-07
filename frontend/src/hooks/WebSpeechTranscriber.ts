/**
 * Browser-based STT adapter using the Web Speech API.
 * Processes audio PCM data and emits transcript segments.
 * Runs entirely in the browser; no backend needed.
 */

import type { TranscriberProvider } from "../providers";
import type { TranscriptMessage } from "../types";

export class WebSpeechTranscriber implements TranscriberProvider {
  private recognition: (SpeechRecognitionType | null) = null;
  private isRecording = false;
  private shouldRun = false;

  onTranscript?: (msg: TranscriptMessage) => void;
  onError?: (err: Error) => void;

  constructor() {
    // Initialize Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error(
        "Web Speech API not supported in this browser. Please use Chrome, Edge, or Safari."
      );
    }
    this.recognition = new SpeechRecognition();
    this.setupRecognition();
  }

  private setupRecognition() {
    if (!this.recognition) return;

    // Continuous mode: keep listening across pauses
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    let segmentStartTime = 0;

    this.recognition.onstart = () => {
      console.log("[WebSpeech] Recognition started");
      segmentStartTime = Date.now() / 1000;
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Emit each newly-final result individually so we don't miss any
      // and avoid accumulating duplicates in continuous mode.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            const now = Date.now() / 1000;
            const msg: TranscriptMessage = {
              type: "transcript",
              text,
              start: segmentStartTime,
              end: now,
              topicId: null,
            };
            this.onTranscript?.(msg);
            segmentStartTime = now;
          }
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const error = new Error(`Web Speech API error: ${event.error}`);
      console.error("[WebSpeech]", error.message);
      this.onError?.(error);
    };

    this.recognition.onend = () => {
      console.log("[WebSpeech] Recognition ended");
      this.isRecording = false;
      // Some browsers terminate recognition sporadically; keep session alive.
      if (this.shouldRun && this.recognition) {
        try {
          this.recognition.start();
          // Mark as recording again so stop() can properly halt the session.
          this.isRecording = true;
        } catch {
          // Ignore restart race; browser may still be tearing down.
        }
      }
    };
  }

  async start(): Promise<void> {
    if (!this.recognition) return;
    this.shouldRun = true;
    if (this.isRecording) return;

    try {
      this.recognition.start();
      this.isRecording = true;
      console.log("[WebSpeech] Transcriber started");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[WebSpeech] Failed to start:", error.message);
      this.onError?.(error);
    }
  }

  async stop(): Promise<void> {
    this.shouldRun = false;
    if (!this.isRecording) return;

    this.recognition?.stop();
    this.isRecording = false;

    console.log("[WebSpeech] Transcriber stopped");
  }

  processAudio(_pcm: ArrayBuffer): void {
    // Web Speech API handles audio capture internally via getUserMedia.
    // This method is a no-op for browser-based STT.
    // The API streams directly from the microphone.
  }
}

// Type augmentation for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (event: Event) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: (event: Event) => void;
  start(): void;
  stop(): void;
  abort(): void;
};
