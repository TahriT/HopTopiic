import { useState, useCallback, useRef } from "react";
import type { ClientMessage } from "../types";

interface MediaPanelProps {
  sendMessage: (msg: ClientMessage) => void;
  isRecording: boolean;
}

export function MediaPanel({ sendMessage }: MediaPanelProps) {
  const [mediaUrl, setMediaUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [captionStatus, setCaptionStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStreamMedia = useCallback(() => {
    const url = mediaUrl.trim();
    if (!url) return;

    if (isStreaming) {
      sendMessage({ type: "stop_media" });
      setIsStreaming(false);
    } else {
      sendMessage({ type: "stream_media", url });
      setIsStreaming(true);
    }
  }, [mediaUrl, isStreaming, sendMessage]);

  const handleCaptionFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        sendMessage({
          type: "import_captions",
          content,
          filename: file.name,
        });
        setCaptionStatus(`Imported: ${file.name}`);
        setTimeout(() => setCaptionStatus(null), 3000);
      };
      reader.readAsText(file);

      // Reset input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [sendMessage],
  );

  return (
    <div className="media-panel">
      {/* Media URL input */}
      <div className="media-panel__section">
        <label className="media-panel__label">Media Stream</label>
        <div className="media-panel__url-row">
          <input
            className="media-panel__url-input"
            type="text"
            placeholder="YouTube URL or media link..."
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            disabled={isStreaming}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleStreamMedia();
            }}
          />
          <button
            className={`media-panel__btn ${isStreaming ? "media-panel__btn--active" : ""}`}
            onClick={handleStreamMedia}
            disabled={!mediaUrl.trim() && !isStreaming}
            title={isStreaming ? "Stop stream" : "Start streaming audio from URL"}
          >
            {isStreaming ? "⏹ Stop" : "▶ Stream"}
          </button>
        </div>
        {isStreaming && (
          <p className="media-panel__status">Streaming audio from URL...</p>
        )}
      </div>

      {/* Caption file import */}
      <div className="media-panel__section">
        <label className="media-panel__label">Import Captions</label>
        <div className="media-panel__caption-row">
          <button
            className="media-panel__btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import .srt or .vtt caption file"
          >
            📄 Upload SRT/VTT
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt,.txt"
            onChange={handleCaptionFile}
            style={{ display: "none" }}
          />
          {captionStatus && (
            <span className="media-panel__caption-status">{captionStatus}</span>
          )}
        </div>
      </div>
    </div>
  );
}
