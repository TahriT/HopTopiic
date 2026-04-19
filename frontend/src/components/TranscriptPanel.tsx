import { useRef, useEffect } from "react";
import { useConversationStore } from "../store/conversationStore";
import { moodToTextColor } from "../utils/moodToStyle";
import type { TranscriptSegment } from "../types";

export function TranscriptPanel() {
  const segments = useConversationStore((s) => s.segments);
  const nodes = useConversationStore((s) => s.nodes);
  const activeId = useConversationStore((s) => s.activeId);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new segments
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments.length]);

  if (segments.length === 0) {
    return (
      <div className="transcript-panel transcript-panel--empty">
        <p className="transcript-panel__placeholder">
          Waiting for speech...
        </p>
      </div>
    );
  }

  return (
    <div className="transcript-panel">
      <div className="transcript-panel__header">Transcript</div>
      <div className="transcript-panel__list">
        {segments.map((seg, i) => (
          <TranscriptEntry
            key={i}
            segment={seg}
            topicNode={seg.topicId ? nodes.get(seg.topicId) : undefined}
            isActive={seg.topicId === activeId}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function TranscriptEntry({
  segment,
  topicNode,
  isActive,
}: {
  segment: TranscriptSegment;
  topicNode?: { hopDepth: number; mood: { energy: number; confidence: number } };
  isActive: boolean;
}) {
  const depth = topicNode?.hopDepth ?? 0;
  const color = topicNode ? moodToTextColor(topicNode.mood) : "#94a3b8";

  return (
    <div
      className={`transcript-entry ${isActive ? "transcript-entry--active" : ""}`}
      style={{ paddingLeft: 12 + depth * 16 }}
    >
      <span className="transcript-entry__time" style={{ color: "#64748b" }}>
        {formatTime(segment.start)}
      </span>
      <span className="transcript-entry__depth-bar" style={{ backgroundColor: color }} />
      {segment.speaker && (
        <span
          className="transcript-entry__speaker"
          style={{ color: segment.speakerColor ?? "#94a3b8" }}
        >
          {segment.speaker}
        </span>
      )}
      <span className="transcript-entry__text" style={{ color }}>
        {segment.text}
      </span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
