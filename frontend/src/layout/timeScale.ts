/**
 * Logarithmic time-to-pixel mapping.
 *
 * Maps elapsed seconds → pixel X position using a log scale that:
 *   - Keeps early events well spaced
 *   - Compresses later time so the diagram doesn't stretch infinitely
 *
 * Formula: x = scale * ln(1 + t / compression)
 *
 * `compression` controls where the log curve starts bending (in seconds).
 * Lower values = more aggressive compression.
 * `scale` controls overall pixel width.
 */

/** How many seconds pass before the log curve starts compressing noticeably. */
const COMPRESSION_S = 30;

/** Pixel scale factor. */
const SCALE = 600;

/**
 * Convert elapsed seconds to a pixel X offset (logarithmic).
 *
 * timeToX(0)  = 0
 * timeToX(30) ≈ 416  (gentle compression starts here)
 * timeToX(60) ≈ 660
 * timeToX(300) ≈ 1420
 */
export function timeToX(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  return SCALE * Math.log(1 + elapsedSeconds / COMPRESSION_S);
}

/**
 * Inverse: pixel X offset → elapsed seconds.
 * Useful for hit-testing or ruler label placement.
 */
export function xToTime(x: number): number {
  if (x <= 0) return 0;
  return COMPRESSION_S * (Math.exp(x / SCALE) - 1);
}

/**
 * Generate "nice" tick positions for the logarithmic ruler.
 * Returns an array of elapsed-second values where ticks should appear.
 *
 * Tick spacing adapts: every 5s up to 30s, then 10s up to 2min,
 * then 30s up to 10min, then 1min beyond.
 */
export function generateTicks(maxElapsedSeconds: number): { major: number[]; minor: number[] } {
  const major: number[] = [];
  const minor: number[] = [];

  // Tier 1: 0–30s → every 10s major, 5s minor
  // Tier 2: 30–120s → every 30s major, 10s minor
  // Tier 3: 120–600s → every 60s major, 30s minor
  // Tier 4: 600s+ → every 120s major, 60s minor
  const tiers = [
    { until: 30, majorStep: 10, minorStep: 5 },
    { until: 120, majorStep: 30, minorStep: 10 },
    { until: 600, majorStep: 60, minorStep: 30 },
    { until: Infinity, majorStep: 120, minorStep: 60 },
  ];

  const limit = maxElapsedSeconds + 30; // draw a bit ahead
  for (const tier of tiers) {
    const start = tier === tiers[0] ? 0 : tiers[tiers.indexOf(tier) - 1].until;
    const end = Math.min(tier.until, limit);
    if (start >= limit) break;

    // Major ticks
    const firstMajor = Math.ceil(start / tier.majorStep) * tier.majorStep;
    for (let t = firstMajor; t <= end; t += tier.majorStep) {
      if (!major.includes(t)) major.push(t);
    }

    // Minor ticks
    const firstMinor = Math.ceil(start / tier.minorStep) * tier.minorStep;
    for (let t = firstMinor; t <= end; t += tier.minorStep) {
      if (!major.includes(t) && !minor.includes(t)) minor.push(t);
    }
  }

  // Always include 0 as a major tick
  if (!major.includes(0)) major.unshift(0);

  return { major, minor };
}
