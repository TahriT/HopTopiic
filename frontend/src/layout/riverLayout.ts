/**
 * Custom layout engine for the river diagram.
 *
 * Maps topic nodes to canvas positions:
 *   X = timestamp → pixels (logarithmic timeline)
 *   Y = hopDepth * BASE_Y_STEP + semanticDistFromRoot * SEMANTIC_STRETCH
 *
 * Also computes React Flow node/edge objects from the conversation store data.
 */

import type { Node, Edge } from "@xyflow/react";
import type { TopicNode, TopicEdge, LayoutConfig } from "../types";
import { timeToX } from "./timeScale";

const DEFAULT_CONFIG: LayoutConfig = {
  pixelsPerSecond: 80, // kept for backward compat but not used for X positioning
  baseYStep: 120,
  semanticStretch: 80,
  padding: { top: 80, left: 60 },
};

export interface RiverNode extends Node {
  data: {
    topicNode: TopicNode;
    isActive: boolean;
    isRoot: boolean;
    /** 0 = oldest node, 1 = newest. Used for Z-depth perspective. */
    depthRatio: number;
  };
}

export interface RiverEdge extends Edge {
  data: {
    topicEdge: TopicEdge;
  };
}

export function computeLayout(
  nodes: Map<string, TopicNode>,
  edges: TopicEdge[],
  activeId: string | null,
  rootId: string | null,
  timelineScale: number = 1,
  config: LayoutConfig = DEFAULT_CONFIG,
): { flowNodes: RiverNode[]; flowEdges: RiverEdge[] } {
  const { pixelsPerSecond, baseYStep, semanticStretch, padding } = config;

  // Find the earliest timestamp to use as t=0
  let minTimestamp = Infinity;
  for (const node of nodes.values()) {
    if (node.timestamp < minTimestamp) minTimestamp = node.timestamp;
  }
  if (!isFinite(minTimestamp)) minTimestamp = 0;

  // Determine the time range for Z-depth ratio
  let maxTimestamp = minTimestamp;
  for (const node of nodes.values()) {
    if (node.timestamp > maxTimestamp) maxTimestamp = node.timestamp;
  }
  const timeSpan = maxTimestamp - minTimestamp || 1; // avoid div-by-zero

  const flowNodes: RiverNode[] = [];
  for (const node of nodes.values()) {
    const elapsed = node.timestamp - minTimestamp;
    const x = padding.left + timeToX(elapsed, timelineScale);
    // Y is determined purely by hopDepth so "return to topic" lands on the
    // same row as the original topic.  Branches go further down.
    const y = padding.top + node.hopDepth * baseYStep;

    // 0 = oldest, 1 = newest — drives perspective depth effect
    const depthRatio = elapsed / timeSpan;

    flowNodes.push({
      id: node.id,
      type: "topicChip",
      position: { x, y },
      zIndex: Math.round(depthRatio * 1000),
      data: {
        topicNode: node,
        isActive: node.id === activeId,
        isRoot: node.id === rootId,
        depthRatio,
      },
    });
  }

  const flowEdges: RiverEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "riverEdge",
    animated: edge.type === "return",
    data: { topicEdge: edge },
  }));

  return { flowNodes, flowEdges };
}

/**
 * Compute the total canvas width needed for the current session.
 */
export function computeCanvasWidth(
  nodes: Map<string, TopicNode>,
  timelineScale: number = 1,
  config: LayoutConfig = DEFAULT_CONFIG,
): number {
  let minTimestamp = Infinity;
  let maxTimestamp = 0;
  for (const node of nodes.values()) {
    if (node.timestamp < minTimestamp) minTimestamp = node.timestamp;
    const end = node.endTimestamp ?? node.timestamp;
    if (end > maxTimestamp) maxTimestamp = end;
  }
  if (!isFinite(minTimestamp)) minTimestamp = 0;
  const elapsed = maxTimestamp - minTimestamp;
  return config.padding.left + timeToX(elapsed, timelineScale) + 400;
}
