import { useEffect, useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useConversationStore } from "../store/conversationStore";

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
  const nodeCount = useConversationStore((s) => s.nodes.size);
  const edgeCount = useConversationStore((s) => s.edges.length);
  const paused = useRef(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Tracking mode: follow active node ──
  useEffect(() => {
    if (viewMode !== "tracking" || paused.current || !activeId) return;

    const node = useConversationStore.getState().nodes.get(activeId);
    if (!node) return;

    const t = setTimeout(() => {
      setCenter(node.timestamp * 80 + 200, node.hopDepth * 120 + 60, {
        zoom: 1,
        duration: 300,
      });
    }, 50);

    return () => clearTimeout(t);
  }, [activeId, viewMode, setCenter]);

  // ── Overview mode: fit all nodes whenever graph changes ──
  useEffect(() => {
    if (viewMode !== "overview" || nodeCount === 0) return;

    const t = setTimeout(() => {
      fitView({ padding: 0.3, duration: 400, maxZoom: 1.5 });
    }, 100);

    return () => clearTimeout(t);
  }, [viewMode, nodeCount, edgeCount, fitView]);

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
