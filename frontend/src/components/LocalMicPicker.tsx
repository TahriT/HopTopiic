import { useEffect, useState } from "react";
import { useConversationStore } from "../store/conversationStore";

interface MicOption {
  deviceId: string;
  label: string;
}

export function LocalMicPicker() {
  const selectedMicId = useConversationStore((s) => s.selectedMicId);
  const setSelectedMicId = useConversationStore((s) => s.setSelectedMicId);
  const [devices, setDevices] = useState<MicOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadDevices() {
      try {
        // Request permission once so labels are available in the picker.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());

        const all = await navigator.mediaDevices.enumerateDevices();
        const mics = all
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${i + 1}`,
          }));

        if (!alive) return;
        setDevices(mics);

        if (mics.length > 0 && !selectedMicId) {
          setSelectedMicId(mics[0].deviceId);
        }
      } catch (err) {
        console.error("[LocalMicPicker] Failed to enumerate microphones:", err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadDevices();

    return () => {
      alive = false;
    };
  }, [selectedMicId, setSelectedMicId]);

  if (loading) {
    return <div className="device-picker loading">Loading microphones...</div>;
  }

  if (devices.length === 0) {
    return <div className="device-picker loading">No microphones detected</div>;
  }

  return (
    <div className="device-picker">
      <label className="device-picker__label">Microphone</label>
      <select
        className="device-picker__select"
        value={selectedMicId ?? devices[0].deviceId}
        onChange={(e) => setSelectedMicId(e.target.value)}
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
