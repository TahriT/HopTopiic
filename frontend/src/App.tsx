import { useState, useCallback, useMemo } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useConversationStore } from "./store/conversationStore";
import { useCast } from "./hooks/useCast";
import { RiverCanvas } from "./components/RiverCanvas";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { TimelineRuler, useElapsedTime } from "./components/TimelineRuler";
import { AudioCapture } from "./components/AudioCapture";
import { DevicePicker } from "./components/DevicePicker";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

function App() {
  const { sendAudio, sendMessage } = useWebSocket();
  const inputMode = useConversationStore((s) => s.inputMode);
  const sessionStartTime = useConversationStore((s) => s.sessionStartTime);
  const reset = useConversationStore((s) => s.reset);

  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const { isCasting, startCast, stopCast } = useCast();

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
      sendAudio(pcm);
    },
    [sendAudio],
  );

  const handleSetInputMode = useCallback(
    (mode: "browser" | "device", deviceIndex?: number) => {
      sendMessage({
        type: "set_input",
        mode,
        deviceIndex,
      });
    },
    [sendMessage],
  );

  const handleDeviceSelected = useCallback(
    (deviceIndex: number) => {
      handleSetInputMode("device", deviceIndex);
    },
    [handleSetInputMode],
  );

  const handleReset = useCallback(() => {
    sendMessage({ type: "reset" });
    reset();
    setIsRecording(false);
  }, [sendMessage, reset]);

  const handleToggleRecording = useCallback(() => {
    setIsRecording((prev) => {
      if (prev) {
        // Stopping: tell backend to flush & stop
        sendMessage({ type: "stop_recording" });
      } else {
        // Starting: send initial topic if set
        const topic = useConversationStore.getState().initialTopic.trim();
        if (topic) {
          sendMessage({ type: "set_topic", topic });
        }
      }
      return !prev;
    });
  }, [sendMessage]);

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
        />
      </header>

      {/* Mic error banner */}
      {micError && (
        <div className="app__mic-error" role="alert">
          ⚠️ {micError}
          <button onClick={() => setMicError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Device picker (shown when device mode is active) */}
      {inputMode === "device" && (
        <div className="app__device-bar">
          <DevicePicker onDeviceSelected={handleDeviceSelected} />
        </div>
      )}

      {/* Timeline ruler */}
      <TimelineRuler
        elapsedSeconds={elapsed}
        paddingLeft={60}
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
        </div>
      </div>

      {/* Headless audio capture (browser mic — always active when recording) */}
      <AudioCapture
        onAudioData={handleAudioData}
        active={isRecording}
        onError={setMicError}
      />
    </div>
  );
}

export default App;
