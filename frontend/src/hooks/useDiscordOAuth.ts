/**
 * useDiscordOAuth — Discord webhook.incoming OAuth2 PKCE flow.
 *
 * Flow:
 *  1. User clicks "Connect Channel" → generate PKCE verifier/challenge, redirect to Discord
 *  2. User selects a server + channel in Discord's UI
 *  3. Discord redirects back with ?code=... in the query string
 *  4. This hook exchanges the code + verifier for a token (no client secret needed)
 *  5. The token response includes the webhook object; we persist url + name to localStorage
 *  6. Exposes postTopicHop() and postSessionStart() to post embeds to the connected channel
 *
 * Uses PKCE (RFC 7636) — works from a static site with no backend.
 */

import { useCallback, useEffect, useState } from "react";

const DISCORD_CLIENT_ID = "1501781314326626445";
const REDIRECT_URI = "https://tahrit.github.io/HopTopicc/";
const STORAGE_KEY_WEBHOOK = "hoptopicc-discord-webhook";
const STORAGE_KEY_CHANNEL = "hoptopicc-discord-channel";
const STORAGE_KEY_PKCE = "hoptopicc-pkce-verifier";

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

  // On mount: check if Discord redirected back with ?code=... (PKCE authorization code flow)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    if (!code) return;

    const verifier = sessionStorage.getItem(STORAGE_KEY_PKCE);
    sessionStorage.removeItem(STORAGE_KEY_PKCE);
    if (!verifier) return;

    // Clean the code out of the URL bar immediately
    window.history.replaceState(null, "", window.location.pathname);

    // Exchange authorization code + PKCE verifier for a token (no client secret required)
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });

    fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
      .then((r) => r.json())
      .then((data: any) => {
        const wh = data.webhook;
        if (!wh) return;
        const url: string =
          wh.url ??
          `https://discord.com/api/webhooks/${wh.id}/${wh.token}`;
        const channelName: string = wh.name ?? "Discord channel";
        persist(url, channelName);
        setWebhook({ url, channelName });
      })
      .catch(() => {});
  }, []);

  /** Open Discord's channel picker via OAuth2 PKCE authorization code flow. */
  const connect = useCallback(async () => {
    const { verifier, challenge } = await generatePKCE();
    sessionStorage.setItem(STORAGE_KEY_PKCE, verifier);
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "webhook.incoming",
      code_challenge: challenge,
      code_challenge_method: "S256",
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

/** Generate a PKCE code_verifier and SHA-256 code_challenge. */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64urlEncode(array);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64urlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

function base64urlEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function persist(url: string, channelName: string) {
  try {
    localStorage.setItem(STORAGE_KEY_WEBHOOK, url);
    localStorage.setItem(STORAGE_KEY_CHANNEL, channelName);
  } catch {}
}
