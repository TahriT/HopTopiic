import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useConversationStore } from "../store/conversationStore";
import { timeToX } from "../layout/timeScale";

const ROW_HEIGHT = 100;
const PADDING_LEFT = 60;

export function TimelineControls() {
  const timelineScale = useConversationStore((s) => s.timelineScale);
  const setTimelineScale = useConversationStore((s) => s.setTimelineScale);
  const nodes = useConversationStore((s) => s.nodes);
  const selectedNodeId = useConversationStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useConversationStore((s) => s.setSelectedNodeId);
  const { setCenter } = useReactFlow();

  // Sorted list of topic nodes by timestamp
  const sortedNodes = useMemo(() => {
    return Array.from(nodes.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [nodes]);

  const currentIndex = useMemo(() => {
    if (!selectedNodeId) return -1;
    return sortedNodes.findIndex((n) => n.id === selectedNodeId);
  }, [sortedNodes, selectedNodeId]);

  const jumpToNode = useCallback(
    (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (!node) return;
      setSelectedNodeId(nodeId);
      const x = PADDING_LEFT + timeToX(node.timestamp, timelineScale);
      const y = node.hopDepth * ROW_HEIGHT;
      setCenter(x, y, { zoom: 1.2, duration: 400 });
    },
    [nodes, timelineScale, setCenter, setSelectedNodeId],
  );

  const handlePrev = useCallback(() => {
    if (sortedNodes.length === 0) return;
    const idx = currentIndex <= 0 ? sortedNodes.length - 1 : currentIndex - 1;
    jumpToNode(sortedNodes[idx].id);
  }, [sortedNodes, currentIndex, jumpToNode]);

  const handleNext = useCallback(() => {
    if (sortedNodes.length === 0) return;
    const idx = currentIndex >= sortedNodes.length - 1 ? 0 : currentIndex + 1;
    jumpToNode(sortedNodes[idx].id);
  }, [sortedNodes, currentIndex, jumpToNode]);

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTimelineScale(parseFloat(e.target.value));
    },
    [setTimelineScale],
  );

  return (
    <div className="timeline-controls">
      <div className="timeline-controls__scale">
        <label className="timeline-controls__label">Scale</label>
        <input
          type="range"
          min={0.3}
          max={5}
          step={0.1}
          value={timelineScale}
          onChange={handleScaleChange}
          className="timeline-controls__slider"
        />
        <span className="timeline-controls__value">{timelineScale.toFixed(1)}×</span>
      </div>

      <div className="timeline-controls__divider" />

      <div className="timeline-controls__seek">
        <button
          className="timeline-controls__btn"
          onClick={handlePrev}
          disabled={sortedNodes.length === 0}
          title="Previous segment"
        >
          ◀
        </button>
        <select
          className="timeline-controls__segment-select"
          value={selectedNodeId ?? ""}
          onChange={(e) => {
            if (e.target.value) jumpToNode(e.target.value);
          }}
        >
          <option value="">Jump to segment…</option>
          {sortedNodes.map((n, i) => (
            <option key={n.id} value={n.id}>
              {i + 1}. {n.label}
            </option>
          ))}
        </select>
        <button
          className="timeline-controls__btn"
          onClick={handleNext}
          disabled={sortedNodes.length === 0}
          title="Next segment"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
