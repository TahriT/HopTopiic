/**
 * LocalTopicInferencer — browser-only topic change detection for Local Mode.
 *
 * Detects when the conversation has shifted to a new topic using two signals:
 *  1. Explicit transition phrases ("by the way", "speaking of", etc.)
 *  2. Keyword drift: Jaccard similarity between recent speech and the current
 *     topic's keyword profile drops below a threshold.
 *
 * When a hop is detected, `onTopicChange` fires with an inferred label and
 * estimated mood so the caller can create a new TopicNode in the store.
 */

import type { MoodVector } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Words ignored when building keyword profiles. */
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","it","its","this","that","these","those","was","are","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","i","me","my","myself","we","our","you",
  "your","he","him","his","she","her","they","them","their","what","which",
  "who","whom","when","where","why","how","all","each","both","few","more",
  "most","other","some","such","no","nor","not","only","same","so","than",
  "too","very","just","also","about","after","before","between","can","even",
  "ever","from","get","got","going","here","if","into","like","now","out",
  "over","really","right","said","there","through","up","use","want","well",
  "yeah","yes","yep","okay","ok","um","uh","ah","oh","anyway","actually",
  "basically","literally","honestly","so","well","let","thing","things","make",
  "know","think","see","look","say","go","come","take","give","tell","feel",
]);

/** Conversation transition signals — immediately trigger a topic hop. */
const TRANSITION_PHRASES = [
  "speaking of",
  "by the way",
  "on another note",
  "changing the subject",
  "let me change the topic",
  "let's talk about",
  "let's move on to",
  "moving on",
  "anyway",
  "that reminds me",
  "oh wait",
  "actually i wanted to",
  "back to",
  "switching gears",
  "new topic",
  "totally different",
];

/** Jaccard similarity below this value triggers a keyword-drift hop. */
const DRIFT_THRESHOLD = 0.12;

/**
 * Minimum words in the sliding window before drift checks run.
 * Avoids false positives on short opening sentences.
 */
const MIN_WINDOW_WORDS = 25;

/**
 * Number of final segments to collect before running a drift check.
 * Lower = more responsive; higher = fewer false positives.
 */
const SEGMENTS_PER_CHECK = 4;

/** Minimum seconds between auto-detected hops to avoid fragmentation. */
const MIN_SECONDS_BETWEEN_HOPS = 20;

/** Rolling window size in words. */
const WINDOW_SIZE = 70;

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function keywordFreq(words: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

function jaccardSimilarity(
  setA: Set<string>,
  setB: Set<string>,
): number {
  if (setA.size === 0 || setB.size === 0) return 1; // Not enough data — don't trigger
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 1;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TopicChangeEvent {
  label: string;
  mood: MoodVector;
  triggeredBy: "transition_phrase" | "keyword_drift";
}

export class LocalTopicInferencer {
  /** Keyword profile of the current topic (built from all its segments). */
  private currentTopicWords: Map<string, number> = new Map();

  /** Sliding window of recent tokens (last WINDOW_SIZE words). */
  private windowWords: string[] = [];

  /** How many segments have been ingested since the last hop/reset. */
  private segmentsSinceLastHop = 0;

  /** Wall-clock time (seconds) of the last emitted hop. */
  private lastHopTime = 0;

  /** Total words ever seen (used to gate early drift checks). */
  private totalWords = 0;

  /** Called when the inferencer decides a topic change has occurred. */
  onTopicChange?: (event: TopicChangeEvent) => void;

  // ── Public methods ────────────────────────────────────────────────────────

  /**
   * Feed a new transcript segment into the inferencer.
   * @param text  Raw transcript text from the speech recogniser.
   * @param wallTimeSec  Absolute wall-clock time in seconds (Date.now()/1000).
   */
  ingest(text: string, wallTimeSec: number): void {
    const words = tokenize(text);
    if (words.length === 0) return;

    this.totalWords += words.length;
    this.segmentsSinceLastHop++;

    // Update sliding window
    this.windowWords.push(...words);
    if (this.windowWords.length > WINDOW_SIZE) {
      this.windowWords = this.windowWords.slice(-WINDOW_SIZE);
    }

    // Also grow current topic profile (for next check's baseline)
    for (const w of words) {
      this.currentTopicWords.set(w, (this.currentTopicWords.get(w) ?? 0) + 1);
    }

    // 1. Immediate check: explicit transition phrase
    const lower = text.toLowerCase();
    if (TRANSITION_PHRASES.some((p) => lower.includes(p))) {
      if (wallTimeSec - this.lastHopTime >= 5) {
        // Short cooldown for explicit transitions (they're intentional)
        this.emitHop(wallTimeSec, "transition_phrase");
      }
      return;
    }

    // 2. Periodic check: keyword drift
    if (
      this.segmentsSinceLastHop >= SEGMENTS_PER_CHECK &&
      this.totalWords >= MIN_WINDOW_WORDS &&
      wallTimeSec - this.lastHopTime >= MIN_SECONDS_BETWEEN_HOPS
    ) {
      this.checkDrift(wallTimeSec);
    }
  }

  /**
   * Called when a new topic node is created externally (including the root).
   * Seeds the current topic profile from the label text.
   */
  resetTopic(label: string): void {
    this.currentTopicWords = keywordFreq(tokenize(label));
    this.windowWords = [];
    this.segmentsSinceLastHop = 0;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private checkDrift(wallTimeSec: number): void {
    const windowKeywords = new Set(keywordFreq(this.windowWords).keys());
    const topicKeywords = new Set(this.currentTopicWords.keys());

    const sim = jaccardSimilarity(windowKeywords, topicKeywords);
    if (sim < DRIFT_THRESHOLD) {
      this.emitHop(wallTimeSec, "keyword_drift");
    } else {
      // Reset segment counter so we check again after SEGMENTS_PER_CHECK more
      this.segmentsSinceLastHop = 0;
    }
  }

  private emitHop(wallTimeSec: number, triggeredBy: TopicChangeEvent["triggeredBy"]): void {
    this.lastHopTime = wallTimeSec;
    this.segmentsSinceLastHop = 0;

    const label = this.inferLabel();
    const mood = this.inferMood();

    // Reset topic profile to the recent window (new topic baseline)
    this.currentTopicWords = keywordFreq(this.windowWords);
    this.windowWords = [];

    this.onTopicChange?.({ label, mood, triggeredBy });
  }

  private inferLabel(): string {
    const freq = keywordFreq(this.windowWords);
    const top = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
    return top.join(" ") || "New Topic";
  }

  private inferMood(): MoodVector {
    const text = this.windowWords.join(" ");
    // Energy: punctuation density + exclamation markers
    const exclamations = (text.match(/!/g) ?? []).length;
    const energy = Math.min(1, 0.4 + exclamations * 0.15);
    // Confidence: fewer questions = more confident
    const questions = (text.match(/\?/g) ?? []).length;
    const confidence = Math.max(0.2, 0.7 - questions * 0.1);
    return { energy, confidence };
  }
}
