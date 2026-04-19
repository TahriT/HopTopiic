"""Speaker identification using Vosk speaker vectors.

Clusters speaker embeddings from Vosk's spk model to assign consistent
speaker labels (Speaker 1, Speaker 2, ...) across the conversation.
Uses simple cosine similarity with a threshold to decide if a new
embedding belongs to a known speaker or is a new one.
"""

from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)

# Similarity threshold: above this, same speaker.
# Vosk spk-0.4 produces 128-dim x-vectors whose cosine similarity for the
# same speaker on short utterances typically ranges 0.45-0.75.  A threshold
# of 0.5 catches same-speaker pairs while still splitting genuinely
# different voices.
SPEAKER_SIM_THRESHOLD = 0.5

# Minimum word count for an utterance's speaker vector to be considered
# reliable.  Very short phrases ("yeah", "ok") produce noisy embeddings.
MIN_WORDS_FOR_SPEAKER = 3

# Color palette for speaker labels
SPEAKER_COLORS = [
    "#f97316",  # orange
    "#22d3ee",  # cyan
    "#a78bfa",  # violet
    "#34d399",  # emerald
    "#fb7185",  # rose
    "#facc15",  # yellow
    "#60a5fa",  # blue
    "#f472b6",  # pink
]


class SpeakerTracker:
    """Tracks speakers by clustering Vosk speaker embedding vectors."""

    def __init__(self, sim_threshold: float = SPEAKER_SIM_THRESHOLD) -> None:
        self._sim_threshold = sim_threshold
        # List of (label, accumulated_vectors)
        self._speakers: list[tuple[str, list[np.ndarray]]] = []
        # Track the last assigned speaker so short utterances inherit it
        self._last_speaker_idx: int = 0

    @property
    def speaker_count(self) -> int:
        return len(self._speakers)

    def identify(
        self,
        spk_vector: np.ndarray | None,
        text: str = "",
    ) -> tuple[str, str]:
        """Identify the speaker from an embedding vector.

        Returns:
            (speaker_label, speaker_color)
            e.g. ("Speaker 1", "#f97316")
            If spk_vector is None, returns the last-known speaker.
        """
        word_count = len(text.split()) if text else 0

        # No vector at all → return last-known speaker
        if spk_vector is None:
            return self._last_speaker()

        # Too few words → embedding is unreliable, return last-known speaker
        if word_count < MIN_WORDS_FOR_SPEAKER:
            logger.debug(
                "[SPEAKER] utterance too short (%d words), keeping last speaker",
                word_count,
            )
            # Still accumulate the vector for the last speaker if we have one
            if self._speakers:
                self._accumulate(self._last_speaker_idx, spk_vector)
            return self._last_speaker()

        best_idx = -1
        best_sim = -1.0

        for idx, (label, vectors) in enumerate(self._speakers):
            mean_vec = np.mean(vectors, axis=0)
            sim = self._cosine_sim(spk_vector, mean_vec)
            logger.debug("[SPEAKER] sim to %s = %.4f (n_vecs=%d)", label, sim, len(vectors))
            if sim > best_sim:
                best_sim = sim
                best_idx = idx

        if best_idx >= 0 and best_sim >= self._sim_threshold:
            self._accumulate(best_idx, spk_vector)
            self._last_speaker_idx = best_idx
            label = self._speakers[best_idx][0]
            color = SPEAKER_COLORS[best_idx % len(SPEAKER_COLORS)]
            logger.info("[SPEAKER] matched %s (sim=%.4f, threshold=%.2f)", label, best_sim, self._sim_threshold)
            return (label, color)

        # New speaker
        logger.info(
            "[SPEAKER] NEW speaker (best_sim=%.4f < threshold=%.2f)",
            best_sim, self._sim_threshold,
        )
        idx = len(self._speakers)
        label = f"Speaker {idx + 1}"
        self._speakers.append((label, [spk_vector]))
        self._last_speaker_idx = idx
        color = SPEAKER_COLORS[idx % len(SPEAKER_COLORS)]
        logger.info("[SPEAKER] Created %s (total speakers=%d)", label, len(self._speakers))
        return (label, color)

    def reset(self) -> None:
        self._speakers.clear()
        self._last_speaker_idx = 0

    def _last_speaker(self) -> tuple[str, str]:
        """Return the last-known speaker label/color, or a default."""
        if not self._speakers:
            return ("Speaker 1", SPEAKER_COLORS[0])
        idx = self._last_speaker_idx
        label = self._speakers[idx][0]
        color = SPEAKER_COLORS[idx % len(SPEAKER_COLORS)]
        logger.debug("[SPEAKER] returning last-known: %s", label)
        return (label, color)

    def _accumulate(self, idx: int, vec: np.ndarray) -> None:
        """Add a vector to a speaker's cluster, keeping at most 20."""
        self._speakers[idx][1].append(vec)
        if len(self._speakers[idx][1]) > 20:
            self._speakers[idx][1].pop(0)

    def _cosine_sim(self, a: np.ndarray, b: np.ndarray) -> float:
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a < 1e-8 or norm_b < 1e-8:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
