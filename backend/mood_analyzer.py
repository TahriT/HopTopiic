"""Mood / sentiment analysis — deferred to silence gaps.

Uses VADER (rule-based, zero model loading) for sentiment and simple
heuristics for energy/confidence.  Designed to run as a secondary task
during conversation pauses rather than blocking the real-time pipeline.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np

from .models import MoodVector

logger = logging.getLogger(__name__)

# ── VADER setup (lazy-loaded) ─────────────────────────────────

_vader: Any = None


def _get_vader():
    global _vader
    if _vader is None:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        _vader = SentimentIntensityAnalyzer()
    return _vader


# Common English filler / hesitation words
FILLER_WORDS = {
    "um", "uh", "uh-huh", "uhm", "uhh", "umm",
    "like", "you know", "i mean", "basically",
    "sort of", "kind of", "actually", "literally",
    "right", "so", "well", "anyway", "honestly",
}

MAX_SPEECH_RATE = 4.0
MIN_SPEECH_RATE = 1.0
MAX_FILLER_RATIO = 0.15


# ── Quick mood (real-time, no VADER) ──────────────────────────

def quick_mood(text: str, start: float, end: float) -> MoodVector:
    """Fast mood estimate from speech rate + filler words only.
    Called inline on every segment — no heavy processing."""
    duration = max(end - start, 0.1)
    words = text.split()
    word_count = len(words)

    speech_rate = word_count / duration
    energy = _normalize(speech_rate, MIN_SPEECH_RATE, MAX_SPEECH_RATE)

    filler_count = _count_fillers(text)
    filler_ratio = filler_count / max(word_count, 1)
    confidence = 1.0 - _normalize(filler_ratio, 0.0, MAX_FILLER_RATIO)

    mood = MoodVector(
        energy=round(float(np.clip(energy, 0.0, 1.0)), 3),
        confidence=round(float(np.clip(confidence, 0.0, 1.0)), 3),
    )
    logger.debug("[MOOD-QUICK] words=%d rate=%.1f energy=%.3f conf=%.3f",
                 word_count, speech_rate, mood.energy, mood.confidence)
    return mood


# ── Deferred mood (runs during silence gaps) ──────────────────

@dataclass
class PendingMood:
    """A segment queued for deeper sentiment analysis."""
    topic_id: str
    text: str
    start: float
    end: float


class DeferredMoodAnalyzer:
    """Queues segments and processes them during conversation gaps.

    The main pipeline calls `enqueue()` for each segment.  A background
    thread watches for silence gaps (no new segments for `gap_threshold_s`)
    and then runs VADER sentiment on all queued segments, emitting
    topic_update events with refined mood vectors.
    """

    def __init__(
        self,
        gap_threshold_s: float = 2.0,
        on_mood_update: Callable[[str, MoodVector], Any] | None = None,
    ) -> None:
        self._queue: deque[PendingMood] = deque(maxlen=500)
        self._lock = threading.Lock()
        self._last_enqueue_time: float = 0.0
        self._gap_threshold = gap_threshold_s
        self._on_mood_update = on_mood_update
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def reset(self) -> None:
        self.stop()
        with self._lock:
            self._queue.clear()
        self._last_enqueue_time = 0.0

    def enqueue(self, topic_id: str, text: str, start: float, end: float) -> None:
        """Queue a segment for deferred sentiment analysis."""
        with self._lock:
            self._queue.append(PendingMood(topic_id, text, start, end))
            self._last_enqueue_time = time.monotonic()
            logger.debug("[MOOD-DEFER] enqueued topic=%s qlen=%d", topic_id, len(self._queue))

    def _loop(self) -> None:
        logger.debug("[MOOD-DEFER] background loop started")
        while self._running:
            time.sleep(0.5)

            with self._lock:
                if not self._queue:
                    continue
                elapsed = time.monotonic() - self._last_enqueue_time
                if elapsed < self._gap_threshold:
                    continue
                # Gap detected — drain queue
                batch = list(self._queue)
                self._queue.clear()

            logger.debug("[MOOD-DEFER] gap detected, processing batch of %d", len(batch))
            self._process_batch(batch)

    def _process_batch(self, batch: list[PendingMood]) -> None:
        """Run VADER on queued segments, grouped by topic."""
        vader = _get_vader()

        # Group by topic_id
        topic_texts: dict[str, list[PendingMood]] = {}
        for item in batch:
            topic_texts.setdefault(item.topic_id, []).append(item)

        for topic_id, items in topic_texts.items():
            combined_text = " ".join(it.text for it in items)
            total_start = items[0].start
            total_end = items[-1].end

            # VADER compound: -1 to +1
            scores = vader.polarity_scores(combined_text)
            compound = scores["compound"]

            # Map VADER compound → energy (absolute intensity)
            # and combine with speech-rate energy from quick_mood
            vader_energy = abs(compound)

            # Quick mood for rate-based features
            qm = quick_mood(combined_text, total_start, total_end)

            # Blend: 60% speech-rate energy, 40% VADER intensity
            blended_energy = 0.6 * qm.energy + 0.4 * vader_energy

            # Confidence stays from quick_mood (filler-based)
            mood = MoodVector(
                energy=round(float(np.clip(blended_energy, 0.0, 1.0)), 3),
                confidence=qm.confidence,
            )

            logger.info("[MOOD-DEFER] topic=%s compound=%.3f blended_energy=%.3f conf=%.3f",
                        topic_id, compound, blended_energy, mood.confidence)
            if self._on_mood_update:
                self._on_mood_update(topic_id, mood)


# ── Helpers ───────────────────────────────────────────────────

def _count_fillers(text: str) -> int:
    lower = text.lower()
    count = 0
    for filler in FILLER_WORDS:
        count += len(re.findall(r"\b" + re.escape(filler) + r"\b", lower))
    return count


def _normalize(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.5
    return float(np.clip((value - lo) / (hi - lo), 0.0, 1.0))
