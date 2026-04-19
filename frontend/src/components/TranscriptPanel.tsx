import { useRef, useEffect } from "react";
import { useConversationStore } from "../store/conversationStore";
import { moodToTextColor } from "../utils/moodToStyle";
import type { TranscriptSegment } from "../types";

export function TranscriptPanel() {
  const segments = useConversationStore((s) => s.segments);
  const nodes = useConversationStore((s) => s.nodes);
  const activeId = useConversationStore((s) => s.activeId);
  const selectedNodeId = useConversationStore((s) => s.selectedNodeId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstSelectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new segments (only when no node is selected)
  useEffect(() => {
    if (!selectedNodeId) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments.length, selectedNodeId]);

  // Scroll to first selected segment when a node is clicked
  useEffect(() => {
    if (selectedNodeId && firstSelectedRef.current) {
      firstSelectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedNodeId]);

  if (segments.length === 0) {
    return (
      <div className="transcript-panel transcript-panel--empty">
        <p className="transcript-panel__placeholder">
          Waiting for speech...
        </p>
      </div>
    );
  }

  let firstSelectedAssigned = false;

  return (
    <div className="transcript-panel">
      <div className="transcript-panel__header">
        Transcript
        {selectedNodeId && (
          <button
            className="transcript-panel__clear-sel"
            onClick={() => useConversationStore.getState().setSelectedNodeId(null)}
            title="Clear selection"
          >
            ✕
          </button>
        )}
      </div>
      <div className="transcript-panel__list">
        {segments.map((seg, i) => {
          const isSelected = !!selectedNodeId && seg.topicId === selectedNodeId;
          const isDimmed = !!selectedNodeId && !isSelected;
          let ref: React.Ref<HTMLDivElement> | undefined;
          if (isSelected && !firstSelectedAssigned) {
            ref = firstSelectedRef;
            firstSelectedAssigned = true;
          }
          return (
            <TranscriptEntry
              key={i}
              ref={ref}
              segment={seg}
              topicNode={seg.topicId ? nodes.get(seg.topicId) : undefined}
              isActive={seg.topicId === activeId}
              isSelected={isSelected}
              isDimmed={isDimmed}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import React from "react";

const TranscriptEntry = React.forwardRef<
  HTMLDivElement,
  {
    segment: TranscriptSegment;
    topicNode?: { hopDepth: number; mood: { energy: number; confidence: number } };
    isActive: boolean;
    isSelected: boolean;
    isDimmed: boolean;
  }
>(function TranscriptEntry({ segment, topicNode, isActive, isSelected, isDimmed }, ref) {
  const depth = topicNode?.hopDepth ?? 0;
  const color = topicNode ? moodToTextColor(topicNode.mood) : "#94a3b8";

  return (
    <div
      ref={ref}
      className={[
        "transcript-entry",
        isActive && "transcript-entry--active",
        isSelected && "transcript-entry--selected",
        isDimmed && "transcript-entry--dimmed",
      ].filter(Boolean).join(" ")}
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
});

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
