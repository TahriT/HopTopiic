import { useEffect, useState } from "react";
import type { AudioDevice, AudioDeviceList } from "../types";
import { useConversationStore, getHttpUrl } from "../store/conversationStore";

interface DevicePickerProps {
  onDeviceSelected: (deviceIndex: number) => void;
}

export function DevicePicker({ onDeviceSelected }: DevicePickerProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [defaultDevice, setDefaultDevice] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const serverUrl = useConversationStore((s) => s.serverUrl);

  useEffect(() => {
    setLoading(true);
    fetch(`${getHttpUrl(serverUrl)}/api/audio-devices`)
      .then((r) => r.json())
      .then((data: AudioDeviceList) => {
        setDevices(data.devices);
        setDefaultDevice(data.defaultDevice);
      })
      .catch((err) => console.error("[DevicePicker] Failed to fetch devices:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (idx: number) => {
    setSelected(idx);
    onDeviceSelected(idx);
  };

  if (loading) {
    return <div className="device-picker loading">Scanning audio devices...</div>;
  }

  return (
    <div className="device-picker">
      <label className="device-picker__label">System Audio Device</label>
      <select
        className="device-picker__select"
        value={selected ?? defaultDevice ?? ""}
        onChange={(e) => handleSelect(Number(e.target.value))}
      >
        <option value="" disabled>
          Select a device...
        </option>
        {devices.map((d) => (
          <option key={d.index} value={d.index}>
            {d.name} ({d.hostApi})
          </option>
        ))}
      </select>
    </div>
  );
}
