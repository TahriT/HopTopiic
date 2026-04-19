import { useEffect, useRef, useCallback } from "react";

interface AudioCaptureProps {
  onAudioData: (pcm: ArrayBuffer) => void;
  active: boolean;
}

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

// AudioWorklet processor source (inlined as a blob)
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = ${BUFFER_SIZE};
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const samples = input[0];
      for (let i = 0; i < samples.length; i++) {
        this._buffer.push(samples[i]);
      }
      while (this._buffer.length >= this._bufferSize) {
        const chunk = this._buffer.splice(0, this._bufferSize);
        this.port.postMessage(new Float32Array(chunk).buffer, []);
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export function AudioCapture({ onAudioData, active }: AudioCaptureProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  /** Incremented on every start/stop to detect stale async completions. */
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    workletRef.current?.disconnect();
    workletRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Prevent double-start
    if (contextRef.current) return;
    const gen = ++generation.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // If stop() was called while getUserMedia was pending, discard
      if (generation.current !== gen) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = ctx;

      // Load worklet from blob URL
      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      // Another generation check after async addModule
      if (generation.current !== gen) {
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());
        contextRef.current = null;
        streamRef.current = null;
        return;
      }

      const source = ctx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(ctx, "pcm-processor");
      workletRef.current = workletNode;

      workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        onAudioData(ev.data);
      };

      source.connect(workletNode);
      workletNode.connect(ctx.destination); // needed to keep processing alive
    } catch (err) {
      console.error("[AudioCapture] Failed to start:", err);
    }
  }, [onAudioData]);

  useEffect(() => {
    if (active) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [active, start, stop]);

  // This is a headless component — renders nothing
  return null;
}
