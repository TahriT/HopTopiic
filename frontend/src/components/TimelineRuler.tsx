import { useEffect, useState } from "react";
import { timeToX, generateTicks } from "../layout/timeScale";

interface TimelineRulerProps {
  /** Current elapsed session time in seconds */
  elapsedSeconds: number;
  paddingLeft: number;
}

export function TimelineRuler({
  elapsedSeconds,
  paddingLeft,
}: TimelineRulerProps) {
  const { major, minor } = generateTicks(elapsedSeconds);
  const totalWidth = paddingLeft + timeToX(elapsedSeconds + 30);

  return (
    <div className="timeline-ruler">
      <svg
        width={totalWidth}
        height={32}
        className="timeline-ruler__svg"
      >
        {/* Baseline */}
        <line
          x1={paddingLeft}
          y1={28}
          x2={totalWidth}
          y2={28}
          stroke="#334155"
          strokeWidth={1}
        />

        {/* Major ticks with labels */}
        {major.map((t) => {
          const x = paddingLeft + timeToX(t);
          return (
            <g key={`major-${t}`}>
              <line
                x1={x}
                y1={18}
                x2={x}
                y2={28}
                stroke="#475569"
                strokeWidth={1}
              />
              <text
                x={x}
                y={14}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {formatTime(t)}
              </text>
            </g>
          );
        })}

        {/* Minor ticks */}
        {minor.map((t) => {
          const x = paddingLeft + timeToX(t);
          return (
            <line
              key={`minor-${t}`}
              x1={x}
              y1={23}
              x2={x}
              y2={28}
              stroke="#334155"
              strokeWidth={1}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** Live timer hook: returns elapsed seconds since start. */
export function useElapsedTime(sessionStartTime: number | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (sessionStartTime === null) return;

    const interval = setInterval(() => {
      const e = Date.now() / 1000 - sessionStartTime;
      // Guard: if elapsed is negative or absurdly large, clamp to 0
      setElapsed(e > 0 && e < 86400 ? e : 0);
    }, 500);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  return elapsed;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
