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

  // ── Initial topic (user-defined anchor) ──
  initialTopic: string;

  // ── Server connection ──
  serverUrl: string; // e.g. "localhost:8000" or "192.168.1.50:8000"

  // ── Actions ──
  addTopic: (msg: TopicMessage) => void;
  addReconnect: (msg: ReconnectMessage) => void;
  addTranscript: (msg: TranscriptMessage) => void;
  updateTopic: (msg: TopicUpdateMessage) => void;
  setConnected: (v: boolean) => void;
  setModelLoaded: (v: boolean) => void;
  setInputMode: (m: "browser" | "device") => void;
  setViewMode: (m: "tracking" | "overview") => void;
  setInitialTopic: (t: string) => void;
  setServerUrl: (url: string) => void;
  reset: () => void;
}

const DEFAULT_MOOD: MoodVector = { energy: 0.5, confidence: 0.5 };
const MAX_SEGMENTS = 500;

const STORAGE_KEY_SERVER = "hoptopiic-server-url";

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

/** Derive WebSocket URL from the stored server address. */
export function getWsUrl(serverUrl: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${serverUrl}/ws/stream`;
}

/** Derive HTTP base URL from the stored server address. */
export function getHttpUrl(serverUrl: string): string {
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${serverUrl}`;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  nodes: new Map(),
  edges: [],
  segments: [],
  rootId: null,
  activeId: null,
  sessionStartTime: null,
  connected: false,
  modelLoaded: false,
  inputMode: "browser",
  viewMode: "tracking",
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
      const edges = [
        ...state.edges,
        {
          id: `e-return-${msg.fromTopicId}-${msg.toTopicId}-${msg.timestamp}`,
          source: msg.fromTopicId,
          target: msg.toTopicId,
          type: "return" as const,
          timestamp: msg.timestamp,
        },
      ];
      return { edges, activeId: msg.toTopicId };
    }),

  addTranscript: (msg) =>
    set((state) => {
      const seg: TranscriptSegment = {
        text: msg.text,
        start: msg.start,
        end: msg.end,
        topicId: msg.topicId,
        speaker: msg.speaker,
        speakerColor: msg.speakerColor,
      };

      const next = [...state.segments, seg];
      return { segments: next.length > MAX_SEGMENTS ? next.slice(-MAX_SEGMENTS) : next };
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
  setInitialTopic: (t) => set({ initialTopic: t }),
  setServerUrl: (url) => {
    try { localStorage.setItem(STORAGE_KEY_SERVER, url); } catch {}
    set({ serverUrl: url });
  },

  reset: () =>
    set({
      nodes: new Map(),
      edges: [],
      segments: [],
      rootId: null,
      activeId: null,
      sessionStartTime: null,
    }),
}));
