import { useEffect, useRef, useCallback } from "react";
import { useConversationStore, getWsUrl } from "../store/conversationStore";
import type { ServerMessage, ClientMessage } from "../types";

const RECONNECT_DELAY_MS = 2000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  /** Guard: set to true by cleanup, prevents orphaned onclose from reconnecting. */
  const disposed = useRef(false);

  const connect = useCallback(() => {
    // Prevent duplicate connections (OPEN *or* still CONNECTING)
    const cur = wsRef.current;
    if (
      cur &&
      (cur.readyState === WebSocket.OPEN ||
        cur.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const store = useConversationStore.getState();
    const wsUrl = getWsUrl(store.serverUrl);

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      store.setConnected(true);
      console.log("[HopTopiic] WebSocket connected to", wsUrl);
    };

    ws.onmessage = (ev: MessageEvent) => {
      // Always read latest actions from store to avoid stale closures
      const s = useConversationStore.getState();
      try {
        const msg: ServerMessage = JSON.parse(ev.data);
        switch (msg.type) {
          case "transcript":
            s.addTranscript(msg);
            break;
          case "topic":
            s.addTopic(msg);
            break;
          case "reconnect":
            s.addReconnect(msg);
            break;
          case "topic_update":
            s.updateTopic(msg);
            break;
          case "status":
            s.setModelLoaded(msg.modelLoaded);
            s.setInputMode(msg.inputMode);
            break;
          case "error":
            console.error("[HopTopiic] Server error:", msg.message);
            break;
        }
      } catch {
        console.warn("[HopTopiic] Failed to parse WS message");
      }
    };

    ws.onclose = () => {
      store.setConnected(false);
      // Only null the ref if this socket is still the current one
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      // Don't reconnect if the hook has been disposed (unmount / StrictMode cleanup)
      if (!disposed.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // Subscribe to serverUrl changes — reconnect when it changes
  const serverUrl = useConversationStore((s) => s.serverUrl);

  useEffect(() => {
    // Dispose first to prevent any pending onclose from reconnecting
    disposed.current = true;
    clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // Now allow new connection
    disposed.current = false;
    connect();
    return () => {
      disposed.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, serverUrl]);

  /** Send binary PCM audio data. */
  const sendAudio = useCallback((pcm: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcm);
    }
  }, []);

  /** Send a JSON control message. */
  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { sendAudio, sendMessage };
}
