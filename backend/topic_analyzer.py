"""Topic shift detection, reconnection, and labeling using spaCy.

Uses spaCy word vectors (en_core_web_md) to detect when the conversation
drifts to a new topic, tracks hop depth in a tree structure, and detects
when the conversation returns to an ancestor topic.  Much lighter than
sentence-transformers — no PyTorch dependency.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import uuid
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

SHIFT_THRESHOLD = 0.55  # below this → new topic
RECONNECT_THRESHOLD = 0.70  # above this with ancestor → reconnect
ROOT_WINDOW_S = 15.0  # first N seconds establish root embedding
WINDOW_SEGMENTS = 3  # rolling window of recent segments for comparison


def _ensure_spacy_model(model_name: str = "en_core_web_md") -> None:
    """Download the spaCy model if not installed."""
    try:
        import spacy
        spacy.load(model_name)
    except OSError:
        logger.info("Downloading spaCy model: %s", model_name)
        subprocess.check_call(
            [sys.executable, "-m", "spacy", "download", model_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


MAX_VECTORS_PER_NODE = 20  # keep rolling window for mean_vector


@dataclass
class TopicNode:
    id: str
    label: str
    timestamp: float
    parent_id: str | None = None
    hop_depth: int = 0
    semantic_dist_from_root: float = 0.0
    vectors: list[np.ndarray] = field(default_factory=list)
    texts: list[str] = field(default_factory=list)
    end_timestamp: float | None = None

    def append_segment(self, vector: np.ndarray, text: str) -> None:
        """Add vector/text, capping to last MAX_VECTORS_PER_NODE entries."""
        self.vectors.append(vector)
        self.texts.append(text)
        if len(self.vectors) > MAX_VECTORS_PER_NODE:
            self.vectors = self.vectors[-MAX_VECTORS_PER_NODE:]
            self.texts = self.texts[-MAX_VECTORS_PER_NODE:]

    @property
    def mean_vector(self) -> np.ndarray | None:
        if not self.vectors:
            return None
        return np.mean(self.vectors, axis=0)


class TopicAnalyzer:
    """Detects topic shifts and manages the conversation topic tree."""

    def __init__(
        self,
        shift_threshold: float = SHIFT_THRESHOLD,
        reconnect_threshold: float = RECONNECT_THRESHOLD,
    ) -> None:
        self._nlp = None
        self._shift_threshold = shift_threshold
        self._reconnect_threshold = reconnect_threshold

        # Topic tree
        self.nodes: dict[str, TopicNode] = {}
        self.root_id: str | None = None
        self.active_id: str | None = None
        self._root_vector: np.ndarray | None = None
        self._root_established = False

    @property
    def active_node(self) -> TopicNode | None:
        if self.active_id:
            return self.nodes.get(self.active_id)
        return None

    def load_models(self) -> None:
        """Load spaCy model with word vectors."""
        import spacy

        _ensure_spacy_model("en_core_web_md")
        logger.info("Loading spaCy en_core_web_md...")
        self._nlp = spacy.load("en_core_web_md")
        logger.info("spaCy model loaded")

    def reset(self) -> None:
        self.nodes.clear()
        self.root_id = None
        self.active_id = None
        self._root_vector = None
        self._root_established = False

    def set_initial_topic(self, topic_text: str) -> dict | None:
        """Pre-seed the root topic from user-supplied text.

        This establishes the root vector immediately so that all subsequent
        speech segments are measured against the intended topic rather than
        waiting for ROOT_WINDOW_S seconds of speech.
        Returns a topic event dict, or None if the model isn't ready.
        """
        if self._nlp is None:
            logger.warning("[TOPIC] set_initial_topic called but _nlp is None")
            return None

        doc = self._nlp(topic_text)
        vector = doc.vector
        if np.linalg.norm(vector) < 1e-6:
            logger.warning("[TOPIC] initial topic '%s' has zero vector", topic_text[:40])
            return None

        # Reset any existing state
        self.reset()

        # Create and immediately establish root
        node = self._make_node(topic_text, 0.0, vector, parent_id=None, hop_depth=0)
        self.root_id = node.id
        self.active_id = node.id
        self._root_vector = vector
        self._root_established = True
        label = self._extract_label_from_doc(doc)
        node.label = label
        logger.info("[TOPIC] Initial topic set: id=%s label=%r", node.id, label)
        return {
            "type": "topic",
            "id": node.id,
            "label": label,
            "timestamp": 0.0,
            "parentId": None,
            "hopDepth": 0,
            "semanticDistFromRoot": 0.0,
        }

    def _get_vector(self, text: str) -> np.ndarray:
        """Get the document vector for a text using spaCy."""
        doc = self._nlp(text)
        return doc.vector  # 300-dim for en_core_web_md

    def _extract_label_from_doc(self, doc) -> str:
        """Extract topic label from an already-parsed spaCy Doc."""
        # Prefer named entities
        entities = [ent.text for ent in doc.ents if ent.label_ not in ("CARDINAL", "ORDINAL", "DATE", "TIME")]
        if entities:
            return ", ".join(entities[:2])

        # Fall back to noun chunks
        chunks = [chunk.text for chunk in doc.noun_chunks if len(chunk.text) > 2]
        if chunks:
            return ", ".join(chunks[:2])

        # Last resort: first few words
        words = doc.text.split()
        return " ".join(words[:4]) + ("..." if len(words) > 4 else "")

    def _extract_label(self, text: str) -> str:
        """Extract topic label — parses text with spaCy."""
        doc = self._nlp(text)
        return self._extract_label_from_doc(doc)

    def process_segment(self, text: str, start: float, end: float) -> dict | None:
        """Process a transcript segment. Returns an event dict or None."""
        if self._nlp is None:
            logger.warning("[TOPIC] process_segment called but _nlp is None (model not loaded)")
            return None

        # Parse once, reuse doc for both vector and label extraction
        doc = self._nlp(text)
        vector = doc.vector

        # Zero vector → skip (no meaningful content)
        if np.linalg.norm(vector) < 1e-6:
            logger.debug("[TOPIC] zero vector for text=%r, skipping", text[:40])
            return None

        # ── Root establishment phase ──
        if not self._root_established:
            logger.debug("[TOPIC] in root phase (root_id=%s, start=%.2f, ROOT_WINDOW_S=%.1f)",
                         self.root_id, start, ROOT_WINDOW_S)
            return self._handle_root_phase(text, start, vector, doc)

        # ── Steady state: check for shift or reconnect ──
        active = self.active_node
        if active is None:
            logger.warning("[TOPIC] no active node in steady state")
            return None

        active_mean = active.mean_vector
        if active_mean is None:
            active.vectors.append(vector)
            active.texts.append(text)
            return None

        sim_to_active = self._cosine_sim(vector, active_mean)
        logger.debug("[TOPIC] sim=%.3f to active=%s (shift_thresh=%.2f, reconnect_thresh=%.2f)",
                     sim_to_active, active.id, self._shift_threshold, self._reconnect_threshold)

        # Check reconnection to any ancestor first
        reconnect_event = self._check_reconnection(vector, start)
        if reconnect_event:
            return reconnect_event

        # Topic shift?
        if sim_to_active < self._shift_threshold:
            return self._create_child_topic(text, start, vector, active, doc)

        # Same topic – accumulate (capped)
        active.append_segment(vector, text)
        active.end_timestamp = end
        return None

    def _handle_root_phase(
        self, text: str, start: float, vector: np.ndarray, doc=None
    ) -> dict | None:
        if self.root_id is None:
            node = self._make_node(text, start, vector, parent_id=None, hop_depth=0)
            self.root_id = node.id
            self.active_id = node.id
            label = self._extract_label_from_doc(doc) if doc else self._extract_label(text)
            node.label = label
            logger.info("[TOPIC] ROOT created id=%s label=%r", node.id, label)
            return {
                "type": "topic",
                "id": node.id,
                "label": label,
                "timestamp": start,
                "parentId": None,
                "hopDepth": 0,
                "semanticDistFromRoot": 0.0,
            }

        root = self.nodes[self.root_id]
        root.append_segment(vector, text)

        if start >= ROOT_WINDOW_S:
            self._root_vector = root.mean_vector
            self._root_established = True
            root.label = self._extract_label(" ".join(root.texts))
            logger.info("[TOPIC] ROOT established label=%r (%.1fs elapsed)", root.label, start)
            return {
                "type": "topic_update",
                "id": root.id,
                "label": root.label,
            }
        logger.debug("[TOPIC] root accumulating (start=%.2f < window=%.1f)", start, ROOT_WINDOW_S)
        return None

    def _check_reconnection(
        self, vector: np.ndarray, timestamp: float
    ) -> dict | None:
        active = self.active_node
        if active is None:
            return None

        ancestors: list[TopicNode] = []
        current_id = active.parent_id
        while current_id is not None:
            node = self.nodes.get(current_id)
            if node is None:
                break
            ancestors.append(node)
            current_id = node.parent_id

        best_sim = 0.0
        best_ancestor: TopicNode | None = None
        for anc in ancestors:
            mean = anc.mean_vector
            if mean is None:
                continue
            sim = self._cosine_sim(vector, mean)
            if sim > best_sim:
                best_sim = sim
                best_ancestor = anc

        if best_ancestor and best_sim >= self._reconnect_threshold:
            active.end_timestamp = timestamp
            self.active_id = best_ancestor.id
            best_ancestor.append_segment(vector, "")
            logger.info("[TOPIC] RECONNECT from=%s to=%s sim=%.3f", active.id, best_ancestor.id, best_sim)
            return {
                "type": "reconnect",
                "fromTopicId": active.id,
                "toTopicId": best_ancestor.id,
                "timestamp": timestamp,
            }

        logger.debug("[TOPIC] no reconnect (best_sim=%.3f, ancestors=%d)", best_sim, len(ancestors))
        return None

    def _create_child_topic(
        self,
        text: str,
        start: float,
        vector: np.ndarray,
        parent: TopicNode,
        doc=None,
    ) -> dict:
        parent.end_timestamp = start
        hop_depth = parent.hop_depth + 1
        sem_dist = self._semantic_dist_from_root(vector)

        node = self._make_node(
            text, start, vector, parent_id=parent.id, hop_depth=hop_depth
        )
        node.semantic_dist_from_root = sem_dist
        self.active_id = node.id

        label = self._extract_label_from_doc(doc) if doc else self._extract_label(text)
        node.label = label
        logger.info("[TOPIC] SHIFT new=%s parent=%s hop=%d label=%r semDist=%.3f",
                     node.id, parent.id, hop_depth, label, sem_dist)
        return {
            "type": "topic",
            "id": node.id,
            "label": label,
            "timestamp": start,
            "parentId": parent.id,
            "hopDepth": hop_depth,
            "semanticDistFromRoot": sem_dist,
        }

    def _make_node(
        self,
        text: str,
        timestamp: float,
        vector: np.ndarray,
        parent_id: str | None,
        hop_depth: int,
    ) -> TopicNode:
        nid = f"t{len(self.nodes) + 1}"
        node = TopicNode(
            id=nid,
            label="",  # caller sets label from already-parsed doc
            timestamp=timestamp,
            parent_id=parent_id,
            hop_depth=hop_depth,
            vectors=[vector],
            texts=[text],
        )
        self.nodes[nid] = node
        return node

    def _cosine_sim(self, a: np.ndarray, b: np.ndarray) -> float:
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a < 1e-8 or norm_b < 1e-8:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    def _semantic_dist_from_root(self, vector: np.ndarray) -> float:
        if self._root_vector is None:
            return 0.0
        sim = self._cosine_sim(vector, self._root_vector)
        return float(np.clip(1.0 - sim, 0.0, 1.0))
