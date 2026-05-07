import { useEffect, useRef, useState } from "react";

interface LocalMicMeterProps {
  deviceId: string | null;
  active: boolean;
}

export function LocalMicMeter({ deviceId, active }: LocalMicMeterProps) {
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<"idle" | "live" | "blocked" | "error">("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    function stop() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setLevel(0);
    }

    async function start() {
      if (!active) {
        setStatus("idle");
        stop();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);

          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / data.length);
          const boosted = Math.min(1, rms * 3.5);
          setLevel(boosted);
          setStatus("live");
          rafRef.current = requestAnimationFrame(tick);
        };

        tick();
      } catch (err: any) {
        const name = err?.name ?? "";
        setLevel(0);
        if (name === "NotAllowedError") {
          setStatus("blocked");
        } else {
          setStatus("error");
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, deviceId]);

  return (
    <div className="local-mic-meter" aria-label="Microphone level meter">
      <div className="local-mic-meter__label">Mic Level</div>
      <div className="local-mic-meter__track">
        <div
          className="local-mic-meter__fill"
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
      <div className="local-mic-meter__status">
        {status === "live" && `${Math.round(level * 100)}%`}
        {status === "idle" && "Idle"}
        {status === "blocked" && "Permission needed"}
        {status === "error" && "Unavailable"}
      </div>
    </div>
  );
}
