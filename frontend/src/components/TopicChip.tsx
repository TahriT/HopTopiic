import { memo, useState, useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { TopicNode } from "../types";
import { moodToStyle } from "../utils/moodToStyle";

interface TopicChipData {
  topicNode: TopicNode;
  isActive: boolean;
  isRoot: boolean;
  /** 0 = oldest, 1 = newest — drives Z-depth perspective. */
  depthRatio: number;
}

function TopicChipComponent({ data }: NodeProps & { data: TopicChipData }) {
  const { topicNode, isActive, isRoot, depthRatio } = data;
  const style = moodToStyle(topicNode.mood, isActive);
  const [speakersExpanded, setSpeakersExpanded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Z-depth perspective disabled — keep all cards at full size/clarity
  const scale = 1;
  const opacity = 1;
  const blur = 0;

  const duration = topicNode.endTimestamp
    ? topicNode.endTimestamp - topicNode.timestamp
    : 0;
  const minWidth = Math.max(80, Math.min(duration * 10 + 80, 240));

  const speakers = topicNode.speakers ?? [];
  const segments = topicNode.segments ?? [];

  const handleCopy = useCallback(async () => {
    const text = segments
      .map((s) => {
        const ts = formatTime(s.start);
        const who = s.speaker ? `[${s.speaker}]` : "";
        return `${ts} ${who} ${s.text}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available (insecure context etc.)
    }
  }, [segments]);

  return (
    <div
      className="topic-chip__perspective"
      style={{
        transform: `scale(${scale})`,
        opacity,
        filter: blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "none",
        transition: "transform 0.4s ease, opacity 0.4s ease, filter 0.4s ease",
        transformOrigin: "center center",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      {/* Title label above the node */}
      <div className="topic-chip__title" style={{ color: style.color }}>
        {topicNode.label}
      </div>

      <div
        className={`topic-chip ${isActive ? "topic-chip--active" : ""} ${isRoot ? "topic-chip--root" : ""} ${expanded ? "topic-chip--expanded" : ""}`}
        style={{
          borderColor: style.color,
          backgroundColor: `${style.color}18`,
          boxShadow: isActive ? `0 0 16px ${style.glowColor}` : "none",
          minWidth: expanded ? 280 : minWidth,
        }}
      >
        {/* Header row: time + expand toggle */}
        <div className="topic-chip__header">
          <span className="topic-chip__time">
            {formatTime(topicNode.timestamp)}
            {topicNode.hopDepth > 0 && (
              <span className="topic-chip__depth">
                {" "}· depth {topicNode.hopDepth}
              </span>
            )}
          </span>
          {segments.length > 0 && (
            <button
              className="topic-chip__expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              title={expanded ? "Collapse transcript" : `${segments.length} segment${segments.length !== 1 ? "s" : ""} — click to expand`}
            >
              {expanded ? "▾" : "▸"} {segments.length}
            </button>
          )}
        </div>

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

        {/* Expanded transcript */}
        {expanded && segments.length > 0 && (
          <div className="topic-chip__transcript">
            <div className="topic-chip__transcript-actions">
              <button
                className="topic-chip__copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                title="Copy transcript to clipboard"
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
            <div className="topic-chip__transcript-list">
              {segments.map((seg, i) => (
                <div key={i} className="topic-chip__segment">
                  <span className="topic-chip__seg-time">{formatTime(seg.start)}</span>
                  {seg.speaker && (
                    <span
                      className="topic-chip__seg-speaker"
                      style={{ color: seg.speakerColor ?? "#94a3b8" }}
                    >
                      {seg.speaker}
                    </span>
                  )}
                  <span className="topic-chip__seg-text">{seg.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const TopicChip = memo(TopicChipComponent);
