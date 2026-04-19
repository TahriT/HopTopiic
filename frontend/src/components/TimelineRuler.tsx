import { useEffect, useState, useMemo } from "react";
import { timeToX, generateTicks } from "../layout/timeScale";
import { useConversationStore } from "../store/conversationStore";
import { moodToStyle } from "../utils/moodToStyle";

interface TimelineRulerProps {
  /** Current elapsed session time in seconds */
  elapsedSeconds: number;
  paddingLeft: number;
  timelineScale?: number;
}

export function TimelineRuler({
  elapsedSeconds,
  paddingLeft,
  timelineScale = 1,
}: TimelineRulerProps) {
  const nodes = useConversationStore((s) => s.nodes);
  const activeId = useConversationStore((s) => s.activeId);
  const selectedNodeId = useConversationStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useConversationStore((s) => s.setSelectedNodeId);

  const { major, minor } = generateTicks(elapsedSeconds);
  const totalWidth = paddingLeft + timeToX(elapsedSeconds + 30, timelineScale);

  const segments = useMemo(
    () =>
      Array.from(nodes.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((n) => ({
          id: n.id,
          x: paddingLeft + timeToX(n.timestamp, timelineScale),
          color: moodToStyle(n.mood, n.id === activeId).color,
          isActive: n.id === activeId,
          isSelected: n.id === selectedNodeId,
          label: n.label,
        })),
    [nodes, activeId, selectedNodeId, paddingLeft, timelineScale],
  );

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
          const x = paddingLeft + timeToX(t, timelineScale);
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
          const x = paddingLeft + timeToX(t, timelineScale);
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

        {/* Segment bars */}
        {segments.map((seg) => (
          <g
            key={`seg-${seg.id}`}
            className="timeline-ruler__segment"
            onClick={() => setSelectedNodeId(seg.id)}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={seg.x}
              y1={2}
              x2={seg.x}
              y2={28}
              stroke={seg.color}
              strokeWidth={seg.isSelected ? 3 : seg.isActive ? 2 : 1.5}
              opacity={seg.isSelected ? 1 : seg.isActive ? 0.9 : 0.5}
            />
            {(seg.isSelected || seg.isActive) && (
              <circle cx={seg.x} cy={4} r={3} fill={seg.color} />
            )}
          </g>
        ))}
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
