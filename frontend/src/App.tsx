import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useConversationStore } from "./store/conversationStore";
import { useCast } from "./hooks/useCast";
import { WebSpeechTranscriber } from "./hooks/WebSpeechTranscriber";
import { LocalTopicInferencer } from "./hooks/LocalTopicInferencer";
import { useDiscordOAuth } from "./hooks/useDiscordOAuth";
import { RiverCanvas } from "./components/RiverCanvas";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { TimelineRuler, useElapsedTime } from "./components/TimelineRuler";
import { AudioCapture } from "./components/AudioCapture";
import { DevicePicker } from "./components/DevicePicker";
import { LocalMicPicker } from "./components/LocalMicPicker";
import { LocalMicMeter } from "./components/LocalMicMeter";
import { IntegrationsPanel } from "./components/IntegrationsPanel";
import { MediaPanel } from "./components/MediaPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExportPanel } from "./components/ExportPanel";
import "./App.css";

function App() {
  const { sendAudio, sendMessage } = useWebSocket();
  const inputMode = useConversationStore((s) => s.inputMode);
  const sessionStartTime = useConversationStore((s) => s.sessionStartTime);
  const reset = useConversationStore((s) => s.reset);
  const timelineScale = useConversationStore((s) => s.timelineScale);
  const localMode = useConversationStore((s) => s.localMode);
  const selectedMicId = useConversationStore((s) => s.selectedMicId);

  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const { isCasting, startCast, stopCast, castError } = useCast();
  const localTranscriberRef = useRef<WebSpeechTranscriber | null>(null);
  const localInferencerRef = useRef<LocalTopicInferencer | null>(null);

  const discord = useDiscordOAuth();
  // Stable ref so callbacks inside effects always use the latest discord methods
  const discordRef = useRef(discord);
  discordRef.current = discord;

  // OBS overlay mode: ?overlay=true hides UI chrome
  const isOverlay = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("overlay") === "true";
  }, []);

  const elapsed = useElapsedTime(
    sessionStartTime !== null ? sessionStartTime : null,
  );

  const handleAudioData = useCallback(
    (pcm: ArrayBuffer) => {
      if (localMode) {
        return;
      }
      sendAudio(pcm);
    },
    [localMode, sendAudio],
  );

  const handleSetInputMode = useCallback(
    (mode: "browser" | "device", deviceIndex?: number) => {
      if (localMode) {
        return;
      }
      sendMessage({
        type: "set_input",
        mode,
        deviceIndex,
      });
    },
    [localMode, sendMessage],
  );

  const handleDeviceSelected = useCallback(
    (deviceIndex: number) => {
      handleSetInputMode("device", deviceIndex);
    },
    [handleSetInputMode],
  );

  const handleReset = useCallback(() => {
    if (!localMode) {
      sendMessage({ type: "reset" });
    }
    reset();
    setIsRecording(false);
  }, [localMode, sendMessage, reset]);

  useEffect(() => {
    if (!localMode) {
      localTranscriberRef.current?.stop().catch(() => {});
      localTranscriberRef.current = null;
      localInferencerRef.current = null;
      return;
    }

    try {
      // ── Topic inferencer ──
      const inferencer = new LocalTopicInferencer();
      localInferencerRef.current = inferencer;

      // ── Transcriber ──
      const transcriber = new WebSpeechTranscriber();
      transcriber.onTranscript = (msg) => {
        const store = useConversationStore.getState();
        const now = Date.now() / 1000;
        const sessionStart = store.sessionStartTime ?? now;

        // Ensure a root topic exists on first transcript
        if (!store.activeId) {
          const rootLabel = store.initialTopic.trim() || "Live Session";
          const rootId = `local-root-${Math.floor(now)}`;
          store.addTopic({
            type: "topic",
            id: rootId,
            label: rootLabel,
            timestamp: 0,
            parentId: null,
            hopDepth: 0,
            semanticDistFromRoot: 0,
            mood: { energy: 0.5, confidence: 0.5 },
          });
          inferencer.resetTopic(rootLabel);
        }

        // Wire topic-change callback so it fires before we pick topicId
        inferencer.onTopicChange = ({ label, mood }) => {
          const s = useConversationStore.getState();
          const ts = Date.now() / 1000;
          const sessionTs = s.sessionStartTime ?? ts;
          const parentId = s.activeId;
          const parentNode = parentId ? s.nodes.get(parentId) : undefined;
          const hopDepth = (parentNode?.hopDepth ?? 0) + 1;
          const newId = `local-topic-${Math.floor(ts * 1000)}`;
          s.addTopic({
            type: "topic",
            id: newId,
            label,
            timestamp: Math.max(0, ts - sessionTs),
            parentId,
            hopDepth,
            semanticDistFromRoot: Math.min(1, hopDepth * 0.25),
            mood,
          });
          inferencer.resetTopic(label);
        };

        // Run inference — may synchronously create a new topic via the callback above
        inferencer.ingest(msg.text, msg.start);

        // Use the (possibly updated) active topic id
        const topicId = useConversationStore.getState().activeId!;
        useConversationStore.getState().addTranscript({
          ...msg,
          start: Math.max(0, msg.start - sessionStart),
          end: Math.max(0.1, msg.end - sessionStart),
          topicId,
        });
      };
      transcriber.onError = (err) => {
        setMicError(err.message);
      };
      localTranscriberRef.current = transcriber;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMicError(message);
    }

    return () => {
      localTranscriberRef.current?.stop().catch(() => {});
      localTranscriberRef.current = null;
      localInferencerRef.current = null;
    };
  }, [localMode]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      // ── Stop ──
      setIsRecording(false);
      if (localMode) {
        localTranscriberRef.current?.stop().catch(() => {});
      } else {
        sendMessage({ type: "stop_recording" });
      }
    } else {
      // ── Start ──
      setIsRecording(true);
      if (localMode) {
        setMicError(null);
        const topic = useConversationStore.getState().initialTopic.trim();
        discordRef.current.postSessionStart(topic);
        localTranscriberRef.current?.start().catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          setMicError(message);
          setIsRecording(false);
        });
      } else {
        // Starting: send initial topic if set
        const topic = useConversationStore.getState().initialTopic.trim();
        if (topic) {
          sendMessage({ type: "set_topic", topic });
        }
      }
    }
  }, [isRecording, localMode, sendMessage]);

  // OBS overlay: transparent background, only show the river diagram
  if (isOverlay) {
    return (
      <div className="app app--overlay">
        <RiverCanvas />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app__header">
        <h1 className="app__title">
          <span className="app__logo">🐇</span> HopTopicc
        </h1>
        <SettingsPanel
          inputMode={inputMode}
          onSetInputMode={handleSetInputMode}
          onReset={handleReset}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          isCasting={isCasting}
          onStartCast={startCast}
          onStopCast={stopCast}
          castError={castError}
        />
      </header>

      {/* Mic error banner */}
      {micError && (
        <div className="app__mic-error" role="alert">
          ⚠️ {micError}
          <button onClick={() => setMicError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Device picker (backend mode only) */}
      {!localMode && inputMode === "device" && (
        <div className="app__device-bar">
          <DevicePicker onDeviceSelected={handleDeviceSelected} />
        </div>
      )}

      {/* Local mic picker */}
      {localMode && (
        <div className="app__device-bar">
          <LocalMicPicker />
          <LocalMicMeter deviceId={selectedMicId} active={true} />
          <div className="app__device-bar-sep" />
          {discord.webhook ? (
            <>
              <span className="app__discord-connected">
                <span className="app__discord-dot" />
                {discord.webhook.channelName}
              </span>
              <button
                className="app__discord-btn app__discord-btn--disconnect"
                onClick={discord.disconnect}
                title="Disconnect Discord channel"
              >
                ✕ Disconnect
              </button>
            </>
          ) : (
            <button
              className="app__discord-btn"
              onClick={discord.connect}
              title="Connect a Discord channel — topic hops will be posted there"
            >
              <svg className="app__discord-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Connect Channel
            </button>
          )}
        </div>
      )}

      {/* Backend-only features */}
      {!localMode && (
        <>
          {/* Media stream & caption import */}
          <MediaPanel sendMessage={sendMessage} isRecording={isRecording} />

          {/* OBS + Discord integrations */}
          <IntegrationsPanel />
        </>
      )}

      {/* Timeline ruler */}
      <TimelineRuler
        elapsedSeconds={elapsed}
        paddingLeft={60}
        timelineScale={timelineScale}
      />

      {/* Main content: river canvas + transcript sidebar */}
      <div className="app__content">
        <div className="app__canvas">
          <RiverCanvas />
          {/* Mobile transcript toggle */}
          <button
            className="app__sidebar-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle transcript"
          >
            {sidebarOpen ? "✕" : "💬"}
          </button>
        </div>
        <div className={`app__sidebar ${sidebarOpen ? "app__sidebar--open" : ""}`}>
          <TranscriptPanel />
          {localMode && <ExportPanel />}
        </div>
      </div>

      {/* Headless audio capture (browser mic — always active when recording) */}
      <AudioCapture
        onAudioData={handleAudioData}
        active={!localMode && isRecording}
        deviceId={selectedMicId}
        onError={setMicError}
      />
    </div>
  );
}

export default App;
