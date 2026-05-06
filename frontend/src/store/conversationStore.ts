import { create } from "zustand";
import type {
  TopicNode,
  TopicEdge,
  TranscriptSegment,
  MoodVector,
  TopicMessage,
  ReconnectMessage,
  TranscriptMessage,
  TopicUpdateMessage,
} from "../types";

interface ConversationState {
  // ── Data ──
  nodes: Map<string, TopicNode>;
  edges: TopicEdge[];
  segments: TranscriptSegment[];
  rootId: string | null;
  activeId: string | null;
  sessionStartTime: number | null;

  // ── Connection status ──
  connected: boolean;
  modelLoaded: boolean;
  inputMode: "browser" | "device";

  // ── View ──
  viewMode: "tracking" | "overview";

  // ── Timeline scale (user-adjustable X-axis spread) ──
  timelineScale: number;

  // ── Selection (user clicked a node) ──
  selectedNodeId: string | null;

  // ── Initial topic (user-defined anchor) ──
  initialTopic: string;

  // ── Server connection ──
  serverUrl: string; // e.g. "localhost:8000" or "192.168.1.50:8000"

  // ── Local Mode ──
  localMode: boolean; // true = frontend-only (Web Speech API), false = use backend
  selectedMicId: string | null;

  // ── Actions ──
  addTopic: (msg: TopicMessage) => void;
  addReconnect: (msg: ReconnectMessage) => void;
  addTranscript: (msg: TranscriptMessage) => void;
  updateTopic: (msg: TopicUpdateMessage) => void;
  setConnected: (v: boolean) => void;
  setModelLoaded: (v: boolean) => void;
  setInputMode: (m: "browser" | "device") => void;
  setViewMode: (m: "tracking" | "overview") => void;
  setTimelineScale: (s: number) => void;
  setSelectedNodeId: (id: string | null) => void;
  setInitialTopic: (t: string) => void;
  setServerUrl: (url: string) => void;
  setLocalMode: (v: boolean) => void;
  setSelectedMicId: (id: string | null) => void;
  reset: () => void;
}

const DEFAULT_MOOD: MoodVector = { energy: 0.5, confidence: 0.5 };
const MAX_SEGMENTS = 500;

const STORAGE_KEY_SERVER = "hoptopiic-server-url";
const STORAGE_KEY_LOCAL_MODE = "hoptopiic-local-mode";
const STORAGE_KEY_MIC_ID = "hoptopiic-local-mic-id";

function getDefaultServer(): string {
  return `${window.location.hostname}:8000`;
}

function loadServerUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SERVER);
    if (stored) {
      // Clear stale localhost entries when accessing from a different host
      // so the dynamic default takes effect
      if (
        stored.startsWith("localhost:") &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        localStorage.removeItem(STORAGE_KEY_SERVER);
        return getDefaultServer();
      }
      return stored;
    }
    return getDefaultServer();
  } catch {
    return getDefaultServer();
  }
}

function loadLocalMode(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LOCAL_MODE);
    if (stored === "true") return true;
    if (stored === "false") return false;
    // Default to Local Mode on hosted environments (e.g. GitHub Pages)
    // where ws:// and http:// backend URLs are blocked by HTTPS.
    return (
      window.location.hostname.endsWith("github.io") ||
      window.location.protocol === "https:"
    );
  } catch {
    return (
      window.location.hostname.endsWith("github.io") ||
      window.location.protocol === "https:"
    );
  }
}

function loadSelectedMicId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_MIC_ID);
  } catch {
    return null;
  }
}

/** Derive WebSocket URL from the stored server address. */
export function getWsUrl(serverUrl: string): string {
  // Always use ws:// — the backend runs plain HTTP.
  // The frontend uses HTTPS only to satisfy getUserMedia secure-context
  // requirements, but the backend API is not behind TLS.
  return `ws://${serverUrl}/ws/stream`;
}

/** Derive HTTP base URL from the stored server address. */
export function getHttpUrl(serverUrl: string): string {
  return `http://${serverUrl}`;
}

export const useConversationStore = create<ConversationState>((set) => ({
  localMode: loadLocalMode(),
  selectedMicId: loadSelectedMicId(),
  nodes: new Map(),
  edges: [],
  segments: [],
  rootId: null,
  activeId: null,
  sessionStartTime: null,
  connected: loadLocalMode(),
  modelLoaded: loadLocalMode(),
  inputMode: "browser",
  viewMode: "tracking",
  timelineScale: 1,
  selectedNodeId: null,
  initialTopic: "",
  serverUrl: loadServerUrl(),

  addTopic: (msg) =>
    set((state) => {
      const nodes = new Map(state.nodes);
      const node: TopicNode = {
        id: msg.id,
        label: msg.label,
        timestamp: msg.timestamp,
        parentId: msg.parentId,
        hopDepth: msg.hopDepth,
        semanticDistFromRoot: msg.semanticDistFromRoot,
        mood: msg.mood ?? DEFAULT_MOOD,
        segments: [],
        speaker: msg.speaker,
        speakerColor: msg.speakerColor,
        speakers: msg.speaker
          ? [{ label: msg.speaker, color: msg.speakerColor ?? '#94a3b8' }]
          : [],
      };
      nodes.set(msg.id, node);

      // Edge from parent → this node
      const edges = [...state.edges];
      if (msg.parentId) {
        edges.push({
          id: `e-${msg.parentId}-${msg.id}`,
          source: msg.parentId,
          target: msg.id,
          type: "branch",
          timestamp: msg.timestamp,
        });
      }

      return {
        nodes,
        edges,
        rootId: state.rootId ?? msg.id,
        activeId: msg.id,
        sessionStartTime: state.sessionStartTime ?? Date.now() / 1000,
      };
    }),

  addReconnect: (msg) =>
    set((state) => {
      const ancestor = state.nodes.get(msg.toTopicId);
      const nodes = new Map(state.nodes);

      // Create a new continuation node at the CURRENT timestamp but on
      // the same row (hopDepth) as the ancestor.  This keeps forward
      // timeline progress while visually showing "back on topic".
      const contId = `${msg.toTopicId}-cont-${msg.timestamp}`;
      const contNode: TopicNode = {
        id: contId,
        label: ancestor?.label ?? "On Topic",
        timestamp: msg.timestamp,
        parentId: msg.toTopicId,
        hopDepth: ancestor?.hopDepth ?? 0,
        semanticDistFromRoot: ancestor?.semanticDistFromRoot ?? 0,
        mood: ancestor?.mood ?? DEFAULT_MOOD,
        segments: [],
        speaker: ancestor?.speaker,
        speakerColor: ancestor?.speakerColor,
        speakers: ancestor?.speakers ? [...ancestor.speakers] : [],
      };
      nodes.set(contId, contNode);

      // Close out the departing topic
      const from = nodes.get(msg.fromTopicId);
      if (from && !from.endTimestamp) {
        nodes.set(msg.fromTopicId, { ...from, endTimestamp: msg.timestamp });
      }

      const edges = [
        ...state.edges,
        // Return edge from the departing topic → continuation
        {
          id: `e-return-${msg.fromTopicId}-${contId}-${msg.timestamp}`,
          source: msg.fromTopicId,
          target: contId,
          type: "return" as const,
          timestamp: msg.timestamp,
        },
      ];

      return { nodes, edges, activeId: contId };
    }),

  addTranscript: (msg) =>
    set((state) => {
      // The backend's topicId may point at the original ancestor, but we
      // may have created a continuation node for it.  If the current
      // activeId is a continuation of msg.topicId, route the segment
      // to the continuation instead.
      let resolvedTopicId = msg.topicId;
      if (
        resolvedTopicId &&
        state.activeId &&
        state.activeId !== resolvedTopicId &&
        state.activeId.startsWith(resolvedTopicId + "-cont-")
      ) {
        resolvedTopicId = state.activeId;
      }

      const seg: TranscriptSegment = {
        text: msg.text,
        start: msg.start,
        end: msg.end,
        topicId: resolvedTopicId,
        speaker: msg.speaker,
        speakerColor: msg.speakerColor,
      };

      const next = [...state.segments, seg];

      // Always clone nodes so we can push segment + update speakers/endTimestamp
      let nodes = state.nodes;
      if (seg.topicId) {
        const topic = nodes.get(seg.topicId);
        if (topic) {
          nodes = new Map(state.nodes);
          const updatedSpeakers = [...topic.speakers];
          if (seg.speaker && !updatedSpeakers.some((s) => s.label === seg.speaker)) {
            updatedSpeakers.push({
              label: seg.speaker!,
              color: seg.speakerColor ?? '#94a3b8',
            });
          }
          nodes.set(seg.topicId, {
            ...topic,
            segments: [...topic.segments, seg],
            speakers: updatedSpeakers,
            endTimestamp: Math.max(topic.endTimestamp ?? 0, seg.end),
          });
        }
      }

      return {
        nodes,
        segments: next.length > MAX_SEGMENTS ? next.slice(-MAX_SEGMENTS) : next,
      };
    }),

  updateTopic: (msg) =>
    set((state) => {
      const nodes = new Map(state.nodes);
      const node = nodes.get(msg.id);
      if (node) {
        nodes.set(msg.id, {
          ...node,
          ...(msg.label !== undefined && { label: msg.label }),
          ...(msg.mood !== undefined && { mood: msg.mood }),
          ...(msg.endTimestamp !== undefined && {
            endTimestamp: msg.endTimestamp,
          }),
        });
      }
      return { nodes };
    }),

  setConnected: (v) => set({ connected: v }),
  setModelLoaded: (v) => set({ modelLoaded: v }),
  setInputMode: (m) => set({ inputMode: m }),
  setViewMode: (m) => set({ viewMode: m }),
  setTimelineScale: (s) => set({ timelineScale: s }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setInitialTopic: (t) => set({ initialTopic: t }),
  setServerUrl: (url) => {
    try { localStorage.setItem(STORAGE_KEY_SERVER, url); } catch {}
    set({ serverUrl: url });
  },
  setLocalMode: (v: boolean) => {
    try { localStorage.setItem(STORAGE_KEY_LOCAL_MODE, v ? "true" : "false"); } catch {}
    // In Local Mode we can start immediately (browser STT), so mark model as ready.
    set({ localMode: v, modelLoaded: v ? true : false, connected: v ? true : false });
  },

  setSelectedMicId: (id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY_MIC_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEY_MIC_ID);
      }
    } catch {}
    set({ selectedMicId: id });
  },
  reset: () =>
    set({
      nodes: new Map(),
      edges: [],
      segments: [],
      rootId: null,
      activeId: null,
      selectedNodeId: null,
      timelineScale: 1,
      sessionStartTime: null,
    }),
}));
