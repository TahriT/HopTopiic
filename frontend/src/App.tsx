import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useConversationStore } from "./store/conversationStore";
import { useCast } from "./hooks/useCast";
import { WebSpeechTranscriber } from "./hooks/WebSpeechTranscriber";
import { RiverCanvas } from "./components/RiverCanvas";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { TimelineRuler, useElapsedTime } from "./components/TimelineRuler";
import { AudioCapture } from "./components/AudioCapture";
import { DevicePicker } from "./components/DevicePicker";
import { LocalMicPicker } from "./components/LocalMicPicker";
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
      return;
    }

    try {
      const transcriber = new WebSpeechTranscriber();
      transcriber.onTranscript = (msg) => {
        const store = useConversationStore.getState();
        const now = Date.now() / 1000;
        const sessionStart = store.sessionStartTime ?? now;

        let topicId = store.activeId;
        if (!topicId) {
          const rootId = `local-root-${Math.floor(now)}`;
          store.addTopic({
            type: "topic",
            id: rootId,
            label: store.initialTopic.trim() || "Live Session",
            timestamp: 0,
            parentId: null,
            hopDepth: 0,
            semanticDistFromRoot: 0,
            mood: { energy: 0.5, confidence: 0.5 },
          });
          topicId = rootId;
        }

        store.addTranscript({
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
    };
  }, [localMode]);

  const handleToggleRecording = useCallback(() => {
    setIsRecording((prev) => {
      if (prev) {
        if (localMode) {
          localTranscriberRef.current?.stop().catch(() => {});
        } else {
          // Stopping: tell backend to flush & stop
          sendMessage({ type: "stop_recording" });
        }
      } else {
        if (localMode) {
          setMicError(null);
          localTranscriberRef.current?.start().catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setMicError(message);
          });
        } else {
          // Starting: send initial topic if set
          const topic = useConversationStore.getState().initialTopic.trim();
          if (topic) {
            sendMessage({ type: "set_topic", topic });
          }
        }
      }
      return !prev;
    });
  }, [localMode, sendMessage]);

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
          <span className="app__logo">🐇</span> HopTopiic
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
