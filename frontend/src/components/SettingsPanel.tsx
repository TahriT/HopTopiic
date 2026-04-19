import { useState } from "react";
import { useConversationStore } from "../store/conversationStore";

interface SettingsPanelProps {
  inputMode: "browser" | "device";
  onSetInputMode: (mode: "browser" | "device", deviceIndex?: number) => void;
  onReset: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  isCasting: boolean;
  onStartCast: () => void;
  onStopCast: () => void;
  castError?: string | null;
}

export function SettingsPanel({
  inputMode,
  onSetInputMode,
  onReset,
  isRecording,
  onToggleRecording,
  isCasting,
  onStartCast,
  onStopCast,
  castError,
}: SettingsPanelProps) {
  const connected = useConversationStore((s) => s.connected);
  const modelLoaded = useConversationStore((s) => s.modelLoaded);
  const viewMode = useConversationStore((s) => s.viewMode);
  const setViewMode = useConversationStore((s) => s.setViewMode);
  const initialTopic = useConversationStore((s) => s.initialTopic);
  const setInitialTopic = useConversationStore((s) => s.setInitialTopic);
  const serverUrl = useConversationStore((s) => s.serverUrl);
  const setServerUrl = useConversationStore((s) => s.setServerUrl);

  const [showServer, setShowServer] = useState(false);

  return (
    <div className="settings-panel">
      {/* Status indicators */}
      <div className="settings-panel__section">
        <div className="settings-panel__status">
          <span
            className={`status-dot ${connected ? "status-dot--connected" : "status-dot--disconnected"}`}
          />
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </div>
        <div className="settings-panel__status">
          <span
            className={`status-dot ${modelLoaded ? "status-dot--connected" : "status-dot--loading"}`}
          />
          <span>{modelLoaded ? "Model Ready" : "Loading Model..."}</span>
        </div>
      </div>

      {/* Server URL (collapsible) */}
      <div className="settings-panel__section">
        <button
          className="settings-panel__server-toggle"
          onClick={() => setShowServer((v) => !v)}
          title="Configure server address"
        >
          ⚙ Server {showServer ? "▾" : "▸"}
        </button>
        {showServer && (
          <input
            className="settings-panel__server-input"
            type="text"
            placeholder="host:port (e.g. 192.168.1.50:8000)"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={isRecording}
          />
        )}
      </div>

      {/* Initial topic input */}
      <div className="settings-panel__section">
        <label className="settings-panel__label">Topic</label>
        <input
          className="settings-panel__topic-input"
          type="text"
          placeholder="Set initial topic..."
          value={initialTopic}
          onChange={(e) => setInitialTopic(e.target.value)}
          disabled={isRecording}
          maxLength={120}
        />
      </div>

      {/* Input source */}
      <div className="settings-panel__section">
        <label className="settings-panel__label">Input</label>
        <div className="settings-panel__toggle">
          <button
            className="toggle-btn toggle-btn--active"
            title="Your device’s microphone is always used when recording"
            style={{ cursor: 'default' }}
          >
            🎤 Mic (this device)
          </button>
          <button
            className={`toggle-btn ${inputMode === "device" ? "toggle-btn--active" : ""}`}
            onClick={() => onSetInputMode(inputMode === "device" ? "browser" : "device")}
            title="Also capture from a server-side audio device (host only)"
          >
            🔌 + Server Device
          </button>
        </div>
      </div>

      {/* View mode */}
      <div className="settings-panel__section">
        <label className="settings-panel__label">View</label>
        <div className="settings-panel__toggle">
          <button
            className={`toggle-btn ${viewMode === "tracking" ? "toggle-btn--active" : ""}`}
            onClick={() => setViewMode("tracking")}
            title="Follow the active topic node as it appears"
          >
            🎯 Track
          </button>
          <button
            className={`toggle-btn ${viewMode === "overview" ? "toggle-btn--active" : ""}`}
            onClick={() => setViewMode("overview")}
            title="Show full graph with all topics and loopbacks"
          >
            🗺️ Overview
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="settings-panel__section">
        <button
          className={`record-btn ${isRecording ? "record-btn--active" : ""}`}
          onClick={onToggleRecording}
          disabled={!modelLoaded}
        >
          {isRecording ? "⏹ Stop" : "⏺ Start"}
        </button>
        <button className="reset-btn" onClick={onReset}>
          ↺ Reset
        </button>
        <button
          className={`cast-btn ${isCasting ? "cast-btn--active" : ""}`}
          onClick={isCasting ? onStopCast : onStartCast}
          title={isCasting ? "Stop casting" : "Cast to second screen"}
        >
          {isCasting ? "📺 Stop Cast" : "📺 Cast"}
        </button>
        {castError && (
          <p className="cast-error" style={{ color: "#e74c3c", fontSize: "0.75rem", margin: "4px 0 0" }}>
            {castError}
          </p>
        )}
      </div>
    </div>
  );
}
