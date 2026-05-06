import { useEffect, useMemo, useState } from "react";
import { getHttpUrl, useConversationStore } from "../store/conversationStore";

interface DiscordStatus {
  enabled: boolean;
  webhookConfigured: boolean;
  botEnabled: boolean;
  botTokenConfigured: boolean;
  botRunning: boolean;
  appPublicUrl: string;
  appPublicUrlLikelyReachable: boolean;
  subscribedChannelCount: number;
  inviteUrl: string | null;
}

export function IntegrationsPanel() {
  const serverUrl = useConversationStore((s) => s.serverUrl);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [discordBotEnabled, setDiscordBotEnabled] = useState(false);
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState(window.location.origin);
  const [speakerName, setSpeakerName] = useState("");
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apiBase = useMemo(() => getHttpUrl(serverUrl), [serverUrl]);
  const obsOverlayUrl = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("overlay", "true");
    return u.toString();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${apiBase}/api/integrations`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const discord = data.discord as DiscordStatus | undefined;
        if (discord) {
          setDiscordStatus(discord);
          setDiscordEnabled(discord.enabled);
          setDiscordBotEnabled(discord.botEnabled);
          if (discord.appPublicUrl) {
            setPublicAppUrl(discord.appPublicUrl);
          }
        }
      } catch {
        // Ignore load failures (server may be restarting)
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  async function saveDiscordConfig() {
    setBusy(true);
    setStatusText(null);
    try {
      const res = await fetch(`${apiBase}/api/integrations/discord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: discordEnabled,
          webhookUrl: discordWebhook.trim(),
          botEnabled: discordBotEnabled,
          botToken: discordBotToken.trim(),
          appPublicUrl: publicAppUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusText("Failed to save Discord settings");
        return;
      }
      setDiscordStatus(data.discord as DiscordStatus);
      setStatusText("Discord settings saved");
    } catch {
      setStatusText("Failed to reach backend");
    } finally {
      setBusy(false);
    }
  }

  async function startDiscordBot() {
    setBusy(true);
    setStatusText(null);
    try {
      const res = await fetch(`${apiBase}/api/integrations/discord/bot/start`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusText(data.message ?? "Failed to start Discord bot");
        return;
      }
      setDiscordStatus(data.discord as DiscordStatus);
      setStatusText("Discord bot started");
    } catch {
      setStatusText("Failed to reach backend");
    } finally {
      setBusy(false);
    }
  }

  async function stopDiscordBot() {
    setBusy(true);
    setStatusText(null);
    try {
      const res = await fetch(`${apiBase}/api/integrations/discord/bot/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusText(data.message ?? "Failed to stop Discord bot");
        return;
      }
      setDiscordStatus(data.discord as DiscordStatus);
      setStatusText("Discord bot stopped");
    } catch {
      setStatusText("Failed to reach backend");
    } finally {
      setBusy(false);
    }
  }

  async function testDiscordWebhook() {
    setBusy(true);
    setStatusText(null);
    try {
      const res = await fetch(`${apiBase}/api/integrations/discord/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusText(data.message ?? "Discord test failed");
        return;
      }
      setStatusText("Discord test sent");
    } catch {
      setStatusText("Failed to reach backend");
    } finally {
      setBusy(false);
    }
  }

  async function copyOverlayUrl() {
    try {
      await navigator.clipboard.writeText(obsOverlayUrl);
      setStatusText("OBS overlay URL copied");
      setTimeout(() => setStatusText(null), 2000);
    } catch {
      setStatusText("Copy failed");
    }
  }

  async function sendSpeakerActivity() {
    const speaker = speakerName.trim();
    if (!speaker) {
      setStatusText("Enter a speaker name first");
      return;
    }
    setBusy(true);
    setStatusText(null);
    try {
      const res = await fetch(`${apiBase}/api/integrations/discord/speaker-activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker,
          ttlSeconds: 4,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusText(data.message ?? "Failed to send speaker activity");
        return;
      }
      setStatusText(`Active speaker override: ${speaker}`);
    } catch {
      setStatusText("Failed to reach backend");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="integrations-panel">
      <div className="integrations-panel__section">
        <div className="integrations-panel__title">OBS</div>
        <div className="integrations-panel__obs-row">
          <input
            className="integrations-panel__input"
            value={obsOverlayUrl}
            readOnly
          />
          <button className="integrations-panel__btn" onClick={copyOverlayUrl}>
            Copy Overlay URL
          </button>
          <a
            className="integrations-panel__btn integrations-panel__btn--link"
            href={obsOverlayUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Overlay
          </a>
        </div>
      </div>

      <div className="integrations-panel__section">
        <div className="integrations-panel__title">Discord</div>
        <div className="integrations-panel__discord-row">
          <label className="integrations-panel__checkbox-label">
            <input
              type="checkbox"
              checked={discordEnabled}
              onChange={(e) => setDiscordEnabled(e.target.checked)}
            />
            Send topic updates to Discord
          </label>
          <label className="integrations-panel__checkbox-label">
            <input
              type="checkbox"
              checked={discordBotEnabled}
              onChange={(e) => setDiscordBotEnabled(e.target.checked)}
            />
            Enable Discord bot mode
          </label>
          <input
            className="integrations-panel__input"
            type="text"
            placeholder="Discord webhook URL"
            value={discordWebhook}
            onChange={(e) => setDiscordWebhook(e.target.value)}
          />
          <input
            className="integrations-panel__input"
            type="password"
            placeholder="Discord bot token"
            value={discordBotToken}
            onChange={(e) => setDiscordBotToken(e.target.value)}
          />
          <input
            className="integrations-panel__input"
            type="text"
            placeholder="Public app URL (for overlay links)"
            value={publicAppUrl}
            onChange={(e) => setPublicAppUrl(e.target.value)}
          />
          <button className="integrations-panel__btn" onClick={saveDiscordConfig} disabled={busy}>
            Save
          </button>
          {discordStatus?.botRunning ? (
            <button className="integrations-panel__btn" onClick={stopDiscordBot} disabled={busy}>
              Stop Bot
            </button>
          ) : (
            <button
              className="integrations-panel__btn"
              onClick={startDiscordBot}
              disabled={busy || !(discordBotToken.trim() || discordStatus?.botTokenConfigured)}
            >
              Start Bot
            </button>
          )}
          <button
            className="integrations-panel__btn"
            onClick={testDiscordWebhook}
            disabled={
              busy ||
              !(
                discordWebhook.trim() ||
                discordStatus?.webhookConfigured ||
                discordStatus?.botRunning
              )
            }
          >
            Send Test
          </button>
          {discordStatus?.inviteUrl && (
            <a
              className="integrations-panel__btn integrations-panel__btn--link"
              href={discordStatus.inviteUrl}
              target="_blank"
              rel="noreferrer"
            >
              Invite Bot
            </a>
          )}
          <span className="integrations-panel__hint">
            In Discord use /hoptopiic_follow for updates and /hoptopiic_activity for the visual/activity link.
          </span>
          {discordStatus && !discordStatus.appPublicUrlLikelyReachable && (
            <span className="integrations-panel__warning">
              Public App URL looks local. Discord users need a public https URL.
            </span>
          )}
          <input
            className="integrations-panel__input integrations-panel__input--compact"
            type="text"
            placeholder="Speaker name from Discord"
            value={speakerName}
            onChange={(e) => setSpeakerName(e.target.value)}
          />
          <button className="integrations-panel__btn" onClick={sendSpeakerActivity} disabled={busy}>
            Mark Active Speaker
          </button>
        </div>
      </div>

      {statusText && <div className="integrations-panel__status">{statusText}</div>}
    </div>
  );
}
