/**
 * Map a MoodVector to visual style properties for the river diagram lines.
 *
 * - Color temperature: warm (red/orange) for high energy → cool (blue/teal) for low energy
 * - Line thickness: bold for confident → thin for hesitant
 * - Dash pattern: solid for confident → dashed for hesitant
 */

import type { MoodVector } from "../types";

export interface LineStyle {
  color: string;
  glowColor: string;
  strokeWidth: number;
  dashArray: string; // SVG stroke-dasharray
  opacity: number;
}

// Warm palette (high energy): #ff6b35 → #ffa500 → #ffd700
// Cool palette (low energy): #00b4d8 → #0077b6 → #023e8a
const WARM_COLORS = ["#ff6b35", "#ff8c42", "#ffa500", "#ffb347", "#ffd700"];
const COOL_COLORS = ["#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4"];

export function moodToStyle(mood: MoodVector, isActive = false): LineStyle {
  const { energy, confidence } = mood;

  // ── Color from energy ──
  const palette = energy >= 0.5 ? WARM_COLORS : COOL_COLORS;
  const colorIndex = Math.min(
    Math.floor(Math.abs(energy - 0.5) * 2 * (palette.length - 1)),
    palette.length - 1,
  );
  const color = palette[colorIndex];

  // Glow: same color, lighter
  const glowColor = energy >= 0.5 ? "#ffa50066" : "#00b4d866";

  // ── Thickness from confidence ──
  // 1.5 (low confidence) → 4 (high confidence)
  const strokeWidth = 1.5 + confidence * 2.5;

  // ── Dash pattern from confidence ──
  // High confidence = solid, low = dashed
  let dashArray = "none";
  if (confidence < 0.3) {
    dashArray = "4 6"; // very dashed
  } else if (confidence < 0.5) {
    dashArray = "8 4"; // slightly dashed
  }

  // Active segments get slightly more opacity
  const opacity = isActive ? 1.0 : 0.75;

  return { color, glowColor, strokeWidth, dashArray, opacity };
}

/**
 * Get a CSS class-friendly color for a topic based on its mood.
 * Used for transcript panel color-coding.
 */
export function moodToTextColor(mood: MoodVector): string {
  return mood.energy >= 0.5 ? "#ffb347" : "#48cae4";
}

/**
 * Default style for when no mood data is available.
 */
export const DEFAULT_STYLE: LineStyle = {
  color: "#64748b",
  glowColor: "#64748b44",
  strokeWidth: 2,
  dashArray: "none",
  opacity: 0.7,
};
