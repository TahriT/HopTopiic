import { memo } from "react";
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

  const duration = topicNode.endTimestamp
    ? topicNode.endTimestamp - topicNode.timestamp
    : 0;
  const minWidth = Math.max(80, Math.min(duration * 10 + 80, 240));

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        className={`topic-chip ${isActive ? "topic-chip--active" : ""} ${isRoot ? "topic-chip--root" : ""}`}
        style={{
          borderColor: style.color,
          backgroundColor: `${style.color}18`,
          boxShadow: isActive ? `0 0 16px ${style.glowColor}` : "none",
          minWidth,
        }}
      >
        <span className="topic-chip__label">{topicNode.label}</span>
        <span className="topic-chip__time">
          {formatTime(topicNode.timestamp)}
        </span>
        {topicNode.speaker && (
          <span
            className="topic-chip__speaker"
            style={{ color: topicNode.speakerColor ?? "#94a3b8" }}
          >
            {topicNode.speaker}
          </span>
        )}
        {topicNode.hopDepth > 0 && (
          <span className="topic-chip__depth">
            depth {topicNode.hopDepth}
            {topicNode.semanticDistFromRoot > 0 &&
              ` · drift ${topicNode.semanticDistFromRoot.toFixed(2)}`}
          </span>
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
