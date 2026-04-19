import type { TopicNode } from "../types";

const DEPTH_LABELS = [
  { depth: 0, label: "Surface", color: "#64748b" },
  { depth: 1, label: "Tangent", color: "#475569" },
  { depth: 2, label: "Deep", color: "#334155" },
  { depth: 3, label: "Rabbit Hole", color: "#1e293b" },
  { depth: 4, label: "Abyss", color: "#0f172a" },
];

const BASE_Y_STEP = 120;
const PADDING_TOP = 80;

interface DepthGuidesProps {
  maxDepth: number;
  canvasWidth: number;
}

export function DepthGuides({ maxDepth, canvasWidth }: DepthGuidesProps) {
  const guides = DEPTH_LABELS.filter((g) => g.depth <= maxDepth);

  return (
    <svg
      className="depth-guides"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth,
        height: (maxDepth + 1) * BASE_Y_STEP + PADDING_TOP + 100,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {guides.map(({ depth, label, color }) => {
        const y = PADDING_TOP + depth * BASE_Y_STEP;
        return (
          <g key={depth}>
            <line
              x1={0}
              y1={y}
              x2={canvasWidth}
              y2={y}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="8 8"
              opacity={0.3}
            />
            <text
              x={12}
              y={y - 6}
              fill={color}
              fontSize={11}
              fontFamily="monospace"
              opacity={0.5}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Get the max hop depth from a set of topic nodes.
 */
export function getMaxDepth(nodes: Map<string, TopicNode>): number {
  let max = 0;
  for (const node of nodes.values()) {
    if (node.hopDepth > max) max = node.hopDepth;
  }
  return Math.max(max, 1); // always show at least depth 1
}
