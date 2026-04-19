import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { TopicNode } from "../types";
import { moodToStyle } from "../utils/moodToStyle";

interface TopicChipData {
  topicNode: TopicNode;
  isActive: boolean;
  isRoot: boolean;
}

function TopicChipComponent({ data }: NodeProps & { data: TopicChipData }) {
  const { topicNode, isActive, isRoot } = data;
  const style = moodToStyle(topicNode.mood, isActive);
  const [speakersExpanded, setSpeakersExpanded] = useState(false);

  const duration = topicNode.endTimestamp
    ? topicNode.endTimestamp - topicNode.timestamp
    : 0;
  const minWidth = Math.max(80, Math.min(duration * 10 + 80, 240));

  const speakers = topicNode.speakers ?? [];

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      {/* Title label above the node */}
      <div className="topic-chip__title" style={{ color: style.color }}>
        {topicNode.label}
      </div>

      <div
        className={`topic-chip ${isActive ? "topic-chip--active" : ""} ${isRoot ? "topic-chip--root" : ""}`}
        style={{
          borderColor: style.color,
          backgroundColor: `${style.color}18`,
          boxShadow: isActive ? `0 0 16px ${style.glowColor}` : "none",
          minWidth,
        }}
      >
        <span className="topic-chip__time">
          {formatTime(topicNode.timestamp)}
          {topicNode.hopDepth > 0 && (
            <span className="topic-chip__depth">
              {" "}· depth {topicNode.hopDepth}
            </span>
          )}
        </span>

        {/* Speaker icons row */}
        {speakers.length > 0 && (
          <div className="topic-chip__speakers">
            <button
              className="topic-chip__speakers-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setSpeakersExpanded((v) => !v);
              }}
              title={speakersExpanded ? "Collapse speakers" : `${speakers.length} speaker${speakers.length > 1 ? "s" : ""}`}
            >
              {speakers.slice(0, speakersExpanded ? speakers.length : 3).map((s, i) => (
                <span
                  key={s.label}
                  className="topic-chip__speaker-icon"
                  style={{
                    backgroundColor: s.color,
                    marginLeft: i > 0 ? -4 : 0,
                    zIndex: speakers.length - i,
                  }}
                  title={s.label}
                >
                  {s.label.charAt(0).toUpperCase()}
                </span>
              ))}
              {!speakersExpanded && speakers.length > 3 && (
                <span className="topic-chip__speaker-more">
                  +{speakers.length - 3}
                </span>
              )}
            </button>
            {speakersExpanded && (
              <div className="topic-chip__speakers-list">
                {speakers.map((s) => (
                  <span
                    key={s.label}
                    className="topic-chip__speaker-label"
                    style={{ color: s.color }}
                  >
                    🎙 {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const TopicChip = memo(TopicChipComponent);
