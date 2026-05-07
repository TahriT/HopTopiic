/**
 * useDiscordOAuth — Discord webhook.incoming OAuth2 implicit flow.
 *
 * Flow:
 *  1. User clicks "Connect Channel" → redirect to Discord OAuth picker
 *  2. User selects a server + channel in Discord's UI
 *  3. Discord redirects back to the app with webhook_id + webhook_token in the URL hash
 *  4. This hook parses the hash, builds the webhook URL, fetches channel info, persists to localStorage
 *  5. Exposes postTopicHop() and postSessionStart() to post embeds to the connected channel
 *
 * No backend or client secret required — uses the public implicit grant flow.
 */

import { useCallback, useEffect, useState } from "react";

const DISCORD_CLIENT_ID = "1501781314326626445";
const REDIRECT_URI = "https://tahrit.github.io/HopTopiic/";
const STORAGE_KEY_WEBHOOK = "hoptopicc-discord-webhook";
const STORAGE_KEY_CHANNEL = "hoptopicc-discord-channel";

// Discord blurple colour for embeds
const DISCORD_COLOR = 0x5865f2;

export interface DiscordWebhook {
  url: string;
  channelName: string;
}

export function useDiscordOAuth() {
  const [webhook, setWebhook] = useState<DiscordWebhook | null>(() => {
    try {
      const url = localStorage.getItem(STORAGE_KEY_WEBHOOK);
      const channelName = localStorage.getItem(STORAGE_KEY_CHANNEL);
      if (url) return { url, channelName: channelName ?? "Discord channel" };
      return null;
    } catch {
      return null;
    }
  });

  // On mount: check if Discord just redirected back with webhook credentials in the hash
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("webhook_id")) return;

    const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
    const webhookId = params.get("webhook_id");
    const webhookToken = params.get("webhook_token");
    if (!webhookId || !webhookToken) return;

    // Clean OAuth tokens out of the URL bar immediately
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    const url = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}`;

    // Fetch webhook metadata to get a human-readable channel name
    fetch(url)
      .then((r) => r.json())
      .then((data: any) => {
        const channelName: string = data.name ?? "Discord channel";
        persist(url, channelName);
        setWebhook({ url, channelName });
      })
      .catch(() => {
        persist(url, "Discord channel");
        setWebhook({ url, channelName: "Discord channel" });
      });
  }, []);

  /** Open Discord's channel picker via OAuth2 implicit grant. */
  const connect = useCallback(() => {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "token",
      scope: "webhook.incoming",
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params}`;
  }, []);

  /** Remove the stored webhook and disconnect. */
  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_WEBHOOK);
      localStorage.removeItem(STORAGE_KEY_CHANNEL);
    } catch {}
    setWebhook(null);
  }, []);

  /**
   * Post a topic-hop embed to the connected Discord channel.
   * Called automatically by App when LocalTopicInferencer detects a hop.
   */
  const postTopicHop = useCallback(
    async (label: string, triggeredBy: "transition_phrase" | "keyword_drift") => {
      const wh = webhook;
      if (!wh) return;
      const emoji = triggeredBy === "transition_phrase" ? "🗣️" : "🔀";
      try {
        await fetch(`${wh.url}?wait=false`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [
              {
                title: `${emoji} Topic → ${label}`,
                color: DISCORD_COLOR,
                footer: {
                  text: `HopTopicc • ${triggeredBy.replace("_", " ")}`,
                },
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch {
        // Webhook failures are non-fatal — don't surface to the user
      }
    },
    [webhook],
  );

  /**
   * Post a session-start embed when the user clicks ⏺ Start.
   */
  const postSessionStart = useCallback(
    async (initialTopic: string) => {
      const wh = webhook;
      if (!wh) return;
      try {
        await fetch(`${wh.url}?wait=false`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [
              {
                title: "🎙️ Session started",
                description: initialTopic
                  ? `Initial topic: **${initialTopic}**`
                  : undefined,
                color: 0x22c55e,
                timestamp: new Date().toISOString(),
                footer: { text: "HopTopicc" },
              },
            ],
          }),
        });
      } catch {}
    },
    [webhook],
  );

  return { webhook, connect, disconnect, postTopicHop, postSessionStart };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function persist(url: string, channelName: string) {
  try {
    localStorage.setItem(STORAGE_KEY_WEBHOOK, url);
    localStorage.setItem(STORAGE_KEY_CHANNEL, channelName);
  } catch {}
}
