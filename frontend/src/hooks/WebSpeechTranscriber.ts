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
  private audioContext: AudioContext | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private microphone: MediaStream | null = null;

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
      let transcript = "";

      // Collect all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        transcript += transcriptSegment;
      }

      // Check if this is a final result
      if (
        event.results.length > 0 &&
        event.results[event.results.length - 1].isFinal
      ) {
        // Final result: emit transcript message
        const now = Date.now() / 1000;
        if (transcript.trim()) {
          const msg: TranscriptMessage = {
            type: "transcript",
            text: transcript,
            start: segmentStartTime,
            end: now,
            topicId: null,
          };
          this.onTranscript?.(msg);
          segmentStartTime = now;
        }
      } else {
        // Interim result: don't emit yet (waiting for final)
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
    };
  }

  async start(): Promise<void> {
    if (this.isRecording || !this.recognition) return;

    // Request microphone access
    try {
      this.microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up audio context if needed (for future audio processing)
      this.audioContext = new AudioContext();
      this.mediaSource = this.audioContext.createMediaStreamSource(
        this.microphone
      );

      this.recognition?.start();
      this.isRecording = true;
      console.log("[WebSpeech] Transcriber started");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[WebSpeech] Failed to start:", error.message);
      this.onError?.(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRecording) return;

    this.recognition?.stop();
    this.isRecording = false;

    // Cleanup audio resources
    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }
    if (this.microphone) {
      this.microphone.getTracks().forEach((track) => track.stop());
      this.microphone = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

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
