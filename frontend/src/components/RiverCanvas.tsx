import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  PanOnScrollMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useConversationStore } from "../store/conversationStore";
import { computeLayout, computeCanvasWidth } from "../layout/riverLayout";
import { DepthGuides, getMaxDepth } from "./DepthGuides";
import { TopicChip } from "./TopicChip";
import { RiverEdge } from "./RiverEdge";
import { useAutoScroll } from "../hooks/useAutoScroll";

const nodeTypes = { topicChip: TopicChip };
const edgeTypes = { riverEdge: RiverEdge };

function RiverCanvasInner() {
  const nodes = useConversationStore((s) => s.nodes);
  const edges = useConversationStore((s) => s.edges);
  const activeId = useConversationStore((s) => s.activeId);
  const rootId = useConversationStore((s) => s.rootId);
  const { onUserPan } = useAutoScroll();

  const { flowNodes, flowEdges } = useMemo(
    () => computeLayout(nodes, edges, activeId, rootId),
    [nodes, edges, activeId, rootId],
  );

  const maxDepth = useMemo(() => getMaxDepth(nodes), [nodes]);
  const canvasWidth = useMemo(() => computeCanvasWidth(nodes), [nodes]);

  const onMoveEnd = useCallback(() => {
    onUserPan();
  }, [onUserPan]);

  return (
    <div className="river-canvas">
      <DepthGuides maxDepth={maxDepth} canvasWidth={canvasWidth} />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onMoveEnd={onMoveEnd}
        fitView={false}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        panOnScrollMode={PanOnScrollMode.Free}
      >
        <Background color="#1e293b" gap={40} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as any;
            return data?.isActive ? "#ffa500" : "#475569";
          }}
          maskColor="#0f172aCC"
          style={{ backgroundColor: "#0f172a" }}
        />
      </ReactFlow>
    </div>
  );
}

export function RiverCanvas() {
  return (
    <ReactFlowProvider>
      <RiverCanvasInner />
    </ReactFlowProvider>
  );
}
