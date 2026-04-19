import { memo } from "react";
import type { EdgeProps } from "@xyflow/react";
import type { TopicEdge } from "../types";
import { useConversationStore } from "../store/conversationStore";
import { moodToStyle, DEFAULT_STYLE } from "../utils/moodToStyle";

interface RiverEdgeData {
  topicEdge: TopicEdge;
}

/**
 * Build a mindmap-style stepped path: horizontal out → vertical step → horizontal in.
 * Gives the diagram a branching tree look instead of plain bezier curves.
 */
function steppedPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  isReturn: boolean,
): string {
  const dx = tx - sx;
  const midX = sx + dx * 0.5;

  if (isReturn) {
    // Return arcs: curve above (or below) with a smooth arc
    const curveY = Math.min(sy, ty) - Math.abs(dx) * 0.15 - 40;
    return `M ${sx},${sy} C ${sx + dx * 0.25},${curveY} ${tx - dx * 0.25},${curveY} ${tx},${ty}`;
  }

  // Branch: horizontal → smooth corner → vertical → smooth corner → horizontal
  // Use rounded elbows for a polished mindmap feel
  const r = Math.min(16, Math.abs(ty - sy) / 2, Math.abs(dx) / 4);
  if (Math.abs(ty - sy) < 2) {
    // Same Y — straight line
    return `M ${sx},${sy} L ${tx},${ty}`;
  }

  const dir = ty > sy ? 1 : -1; // going down or up
  return [
    `M ${sx},${sy}`,
    `L ${midX - r},${sy}`,
    `Q ${midX},${sy} ${midX},${sy + dir * r}`,
    `L ${midX},${ty - dir * r}`,
    `Q ${midX},${ty} ${midX + r},${ty}`,
    `L ${tx},${ty}`,
  ].join(" ");
}

function RiverEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps & { data: RiverEdgeData }) {
  const { topicEdge } = data;
  const isReturn = topicEdge.type === "return";
  const activeId = useConversationStore((s) => s.activeId);
  const nodes = useConversationStore((s) => s.nodes);

  // Get mood style from the source node
  const sourceNode = nodes.get(topicEdge.source);
  const targetNode = nodes.get(topicEdge.target);
  const style = sourceNode
    ? moodToStyle(sourceNode.mood, topicEdge.target === activeId)
    : DEFAULT_STYLE;

  const edgePath = steppedPath(sourceX, sourceY, targetX, targetY, isReturn);

  // Show deviation info on branch edges
  const deviation = targetNode && !isReturn ? targetNode.semanticDistFromRoot : null;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <g className={`river-edge ${isReturn ? "river-edge--return" : "river-edge--branch"}`}>
      {/* Thick glow layer */}
      <path
        d={edgePath}
        fill="none"
        stroke={style.glowColor}
        strokeWidth={style.strokeWidth + 6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.25}
      />
      {/* Main line */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={style.color}
        strokeWidth={style.strokeWidth + 1}
        strokeDasharray={isReturn ? "8 5" : style.dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={style.opacity}
        className={topicEdge.target === activeId ? "river-edge__path--active" : ""}
      />
      {/* Branch arrow at target */}
      {!isReturn && (
        <polygon
          points={`${targetX},${targetY} ${targetX - 8},${targetY - 4} ${targetX - 8},${targetY + 4}`}
          fill={style.color}
          opacity={style.opacity}
        />
      )}
      {/* Return circle marker */}
      {isReturn && (
        <circle cx={targetX} cy={targetY} r={5} fill={style.color} opacity={0.9} />
      )}
      {/* Deviation label on branch edges */}
      {deviation !== null && deviation > 0 && (
        <g>
          <rect
            x={midX - 18}
            y={midY - 9}
            width={36}
            height={18}
            rx={4}
            fill="#0f172aDD"
            stroke={style.color}
            strokeWidth={0.5}
          />
          <text
            x={midX}
            y={midY + 4}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={9}
            fontFamily="monospace"
          >
            {deviation.toFixed(2)}
          </text>
        </g>
      )}
    </g>
  );
}

export const RiverEdge = memo(RiverEdgeComponent);
