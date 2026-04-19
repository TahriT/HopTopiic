/**
 * Progressive (power-law) time-to-pixel mapping.
 *
 * Early topics stay compact, later topics spread out:
 *   x = scale * K * t^EXP
 *
 * EXP > 1 makes spacing grow over time.
 */

/** Base pixel multiplier. */
const K = 2;

/** Exponent — higher = more expansion over time. */
const EXP = 1.3;

export function timeToX(elapsedSeconds: number, scale: number = 1): number {
  if (elapsedSeconds <= 0) return 0;
  return scale * K * Math.pow(elapsedSeconds, EXP);
}

/**
 * Inverse: pixel X offset → elapsed seconds.
 */
export function xToTime(x: number, scale: number = 1): number {
  if (x <= 0) return 0;
  return Math.pow(x / (scale * K), 1 / EXP);
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
