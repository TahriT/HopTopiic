import { useEffect, useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useConversationStore } from "../store/conversationStore";
import { timeToX } from "../layout/timeScale";

const PADDING_LEFT = 60;
const PADDING_TOP = 80;
const BASE_Y_STEP = 120;

/**
 * Controls viewport based on viewMode:
 *  - "tracking": auto-centers on the active topic node as it appears.
 *                Pauses temporarily when the user manually pans.
 *  - "overview": fits the entire graph into view whenever nodes/edges change.
 */
export function useAutoScroll() {
  const { setCenter, fitView } = useReactFlow();
  const activeId = useConversationStore((s) => s.activeId);
  const viewMode = useConversationStore((s) => s.viewMode);
  const timelineScale = useConversationStore((s) => s.timelineScale);
  const nodeCount = useConversationStore((s) => s.nodes.size);
  const edgeCount = useConversationStore((s) => s.edges.length);
  const paused = useRef(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Tracking mode: follow active node ──
  useEffect(() => {
    if (viewMode !== "tracking" || paused.current || !activeId) return;

    const nodes = useConversationStore.getState().nodes;
    const node = nodes.get(activeId);
    if (!node) return;

    // Replicate the same position logic as riverLayout.ts
    let minTimestamp = Infinity;
    for (const n of nodes.values()) {
      if (n.timestamp < minTimestamp) minTimestamp = n.timestamp;
    }
    if (!isFinite(minTimestamp)) minTimestamp = 0;

    const elapsed = node.timestamp - minTimestamp;
    const x = PADDING_LEFT + timeToX(elapsed, timelineScale);
    const y = PADDING_TOP + node.hopDepth * BASE_Y_STEP;

    const t = setTimeout(() => {
      setCenter(x, y, {
        zoom: 1,
        duration: 300,
      });
    }, 50);

    return () => clearTimeout(t);
  }, [activeId, viewMode, timelineScale, setCenter]);

  // ── Overview mode: fit all nodes whenever graph changes ──
  useEffect(() => {
    if (viewMode !== "overview" || nodeCount === 0) return;

    const t = setTimeout(() => {
      fitView({
        padding: 0.15,
        duration: 400,
        minZoom: 0.15,
        maxZoom: 1.2,
        includeHiddenNodes: true,
      });
    }, 100);

    return () => clearTimeout(t);
  }, [viewMode, nodeCount, edgeCount, activeId, fitView]);

  /** Called when user manually pans — pauses tracking for 5s. */
  const onUserPan = useCallback(() => {
    if (viewMode !== "tracking") return;
    paused.current = true;
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      paused.current = false;
    }, 5000);
  }, [viewMode]);

  return { onUserPan };
}
