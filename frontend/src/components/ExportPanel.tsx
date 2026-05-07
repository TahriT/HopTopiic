/**
 * Export Panel: Download conversation events as JSON or NDJSON.
 * Appears in Local Mode to enable event export for external processing.
 */

import { useState, useCallback, useRef } from "react";
import { useConversationStore } from "../store/conversationStore";

export function ExportPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportedSize, setExportedSize] = useState(0);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const segments = useConversationStore((s) => s.segments);
  const nodes = useConversationStore((s) => s.nodes);

  const handleExport = useCallback(
    (format: "json" | "ndjson") => {
      try {
        setIsExporting(true);

        // Build event structure from store state
        const events: Array<{
          type: string;
          timestamp: number;
          data: any;
        }> = [];

        // Add all topics
        nodes.forEach((node) => {
          events.push({
            type: "topic",
            timestamp: Math.floor(node.timestamp * 1000),
            data: {
              id: node.id,
              label: node.label,
              timestamp: node.timestamp,
              parentId: node.parentId,
              hopDepth: node.hopDepth,
              semanticDistFromRoot: node.semanticDistFromRoot,
              mood: node.mood,
              speaker: node.speaker,
              speakers: node.speakers,
            },
          });
        });

        // Add all transcript segments
        segments.forEach((seg) => {
          events.push({
            type: "transcript",
            timestamp: Math.floor(seg.start * 1000),
            data: {
              text: seg.text,
              start: seg.start,
              end: seg.end,
              topicId: seg.topicId,
              speaker: seg.speaker,
              speakerColor: seg.speakerColor,
            },
          });
        });

        // Sort by timestamp
        events.sort((a, b) => a.timestamp - b.timestamp);

        let content: string;
        if (format === "ndjson") {
          content = events.map((e) => JSON.stringify(e)).join("\n");
        } else {
          content = JSON.stringify(
            {
              export: {
                timestamp: new Date().toISOString(),
                nodeCount: nodes.size,
                segmentCount: segments.length,
              },
              events,
            },
            null,
            2
          );
        }

        setExportedSize(new Blob([content]).size);

        // Trigger download
        const blob = new Blob([content], {
          type: format === "ndjson" ? "text/plain" : "application/json",
        });
        const url = URL.createObjectURL(blob);
        const filename = `hoptopicc-export-${Date.now()}.${
          format === "ndjson" ? "ndjson" : "json"
        }`;

        if (downloadRef.current) {
          downloadRef.current.href = url;
          downloadRef.current.download = filename;
          downloadRef.current.click();
          URL.revokeObjectURL(url);
        }

        console.log(
          `[Export] Exported ${events.length} events (${(
            exportedSize / 1024
          ).toFixed(1)} KB) as ${format.toUpperCase()}`
        );
      } catch (err) {
        console.error("[Export] Failed:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [segments, nodes]
  );

  return (
    <div className="export-panel">
      <h3 className="export-panel__title">📥 Export Events</h3>

      <div className="export-panel__buttons">
        <button
          className="export-panel__btn export-panel__btn--json"
          onClick={() => handleExport("json")}
          disabled={isExporting || segments.length === 0}
          title="Download as formatted JSON"
        >
          {isExporting ? "Exporting..." : "JSON"}
        </button>
        <button
          className="export-panel__btn export-panel__btn--ndjson"
          onClick={() => handleExport("ndjson")}
          disabled={isExporting || segments.length === 0}
          title="Download as newline-delimited JSON (one event per line)"
        >
          {isExporting ? "Exporting..." : "NDJSON"}
        </button>
      </div>

      {exportedSize > 0 && (
        <div className="export-panel__info">
          Last export: {(exportedSize / 1024).toFixed(1)} KB
        </div>
      )}

      {segments.length === 0 && (
        <div className="export-panel__empty">Start recording to export events</div>
      )}

      <a ref={downloadRef} style={{ display: "none" }} />
    </div>
  );
}
