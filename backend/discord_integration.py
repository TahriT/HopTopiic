"""Discord integration manager (webhook + bot) for HopTopiic events."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Any
from urllib import request, error
from urllib.parse import urlparse, urlsplit, urlunsplit, parse_qsl, urlencode

try:
    import discord
    from discord import app_commands
except Exception:  # pragma: no cover - optional dependency import guard
    discord = None
    app_commands = None

logger = logging.getLogger(__name__)


@dataclass
class DiscordConfig:
    enabled: bool = False
    webhook_url: str = ""
    bot_enabled: bool = False
    bot_token: str = ""
    app_public_url: str = ""


class DiscordIntegration:
    """Sends topic events to Discord via webhook and optional bot."""

    def __init__(self) -> None:
        self._config = DiscordConfig()
        self._last_sent_at = 0.0
        self._bot_thread: threading.Thread | None = None
        self._bot_loop: asyncio.AbstractEventLoop | None = None
        self._bot_client: Any = None
        self._bot_running = False
        self._bot_application_id: str | None = None
        self._subscribed_channel_ids: set[int] = set()
        self._latest_topic_label = ""
        self._latest_topic_ts = 0.0

    def get_config(self) -> dict:
        invite_url = None
        if self._bot_application_id:
            perms = 274877991936  # Send messages, embeds, view channels, slash commands
            invite_url = (
                f"https://discord.com/oauth2/authorize?client_id={self._bot_application_id}"
                f"&scope=bot%20applications.commands&permissions={perms}"
            )

        parsed = urlparse(self._config.app_public_url) if self._config.app_public_url else None
        hostname = parsed.hostname if parsed else None
        likely_public = bool(
            parsed
            and parsed.scheme in ("http", "https")
            and hostname
            and hostname not in ("localhost", "127.0.0.1")
        )

        return {
            "enabled": self._config.enabled,
            "webhookConfigured": bool(self._config.webhook_url),
            "botEnabled": self._config.bot_enabled,
            "botTokenConfigured": bool(self._config.bot_token),
            "botRunning": self._bot_running,
            "appPublicUrl": self._config.app_public_url,
            "appPublicUrlLikelyReachable": likely_public,
            "subscribedChannelCount": len(self._subscribed_channel_ids),
            "inviteUrl": invite_url,
        }

    def set_config(
        self,
        *,
        enabled: bool,
        webhook_url: str,
        bot_enabled: bool,
        bot_token: str,
        app_public_url: str,
    ) -> None:
        self._config.enabled = enabled
        self._config.webhook_url = webhook_url.strip()
        self._config.bot_enabled = bot_enabled
        self._config.bot_token = bot_token.strip()
        self._config.app_public_url = self._normalize_public_url(app_public_url)

    async def start_bot(self) -> tuple[bool, str]:
        if discord is None or app_commands is None:
            return False, "discord.py is not installed on backend"
        if self._bot_running:
            return True, "Bot already running"
        if not self._config.bot_token:
            return False, "Bot token is not configured"

        self._bot_thread = threading.Thread(target=self._run_bot_thread, daemon=True)
        self._bot_thread.start()

        # Give it a moment to start and connect.
        for _ in range(20):
            if self._bot_running:
                return True, "Bot started"
            await asyncio.sleep(0.25)
        return False, "Bot failed to start"

    async def stop_bot(self) -> tuple[bool, str]:
        if not self._bot_running:
            return True, "Bot is not running"
        if self._bot_loop and self._bot_client:
            fut = asyncio.run_coroutine_threadsafe(self._bot_client.close(), self._bot_loop)
            try:
                fut.result(timeout=8)
            except Exception:
                logger.warning("[DISCORD] timed out waiting for bot close")
        self._bot_running = False
        return True, "Bot stopped"

    def _run_bot_thread(self) -> None:
        if discord is None or app_commands is None:
            return

        loop = asyncio.new_event_loop()
        self._bot_loop = loop
        asyncio.set_event_loop(loop)

        intents = discord.Intents.default()
        client = discord.Client(intents=intents)
        tree = app_commands.CommandTree(client)
        self._bot_client = client

        @client.event
        async def on_ready() -> None:
            self._bot_running = True
            if client.user:
                self._bot_application_id = str(client.user.id)
            try:
                await tree.sync()
            except Exception:
                logger.exception("[DISCORD] Failed syncing slash commands")
            logger.info("[DISCORD] Bot connected as %s", client.user)

        @tree.command(name="hoptopiic_live", description="Show the active HopTopiic conversation visual")
        async def hoptopiic_live(interaction: discord.Interaction) -> None:
            overlay = self._overlay_url()
            content = "Live conversation visual"
            if overlay:
                content += f"\n{overlay}"
            await interaction.response.send_message(content)

        @tree.command(name="hoptopiic_activity", description="Share the HopTopiic activity/visual link in this channel")
        async def hoptopiic_activity(interaction: discord.Interaction) -> None:
            overlay = self._overlay_url()
            if overlay:
                await interaction.response.send_message(
                    "HopTopiic activity link:\n"
                    f"{overlay}\n"
                    "If your app is configured as a Discord Activity, launch it from the Apps/Activities menu."
                )
            else:
                await interaction.response.send_message(
                    "HopTopiic activity URL is not configured yet. Set Public App URL in Integrations."
                )

        @tree.command(name="hoptopiic_follow", description="Post HopTopiic topic updates in this channel")
        async def hoptopiic_follow(interaction: discord.Interaction) -> None:
            channel = interaction.channel
            if channel and hasattr(channel, "id"):
                self._subscribed_channel_ids.add(int(channel.id))
                await interaction.response.send_message("This channel now follows HopTopiic updates.")
            else:
                await interaction.response.send_message("Unable to subscribe this channel.")

        @tree.command(name="hoptopiic_unfollow", description="Stop HopTopiic topic updates in this channel")
        async def hoptopiic_unfollow(interaction: discord.Interaction) -> None:
            channel = interaction.channel
            if channel and hasattr(channel, "id"):
                self._subscribed_channel_ids.discard(int(channel.id))
                await interaction.response.send_message("This channel will no longer receive HopTopiic updates.")
            else:
                await interaction.response.send_message("Unable to update this channel.")

        async def runner() -> None:
            try:
                await client.start(self._config.bot_token)
            except Exception:
                logger.exception("[DISCORD] Bot runtime failed")
            finally:
                self._bot_running = False
                self._bot_client = None

        try:
            loop.run_until_complete(runner())
        finally:
            loop.stop()
            loop.close()

    async def send_test(self) -> tuple[bool, str]:
        if self._bot_running:
            ok = await self._post_bot_message("HopTopiic integration test from bot.")
            return (ok, "Bot test sent" if ok else "Bot test failed")
        if self._config.webhook_url:
            ok = await self._post_webhook_message("HopTopiic integration test: webhook connected.")
            return (ok, "Webhook test sent" if ok else "Webhook test failed")
        return False, "No Discord integration is configured"

    async def publish_event(self, event: dict) -> None:
        if not self._config.enabled:
            return

        event_type = event.get("type")
        message = None

        if event_type == "topic":
            label = str(event.get("label") or "Untitled topic")
            depth = event.get("hopDepth", 0)
            ts = event.get("timestamp", 0)
            self._latest_topic_label = label
            self._latest_topic_ts = float(ts)
            message = f"New topic (depth {depth}) at {ts:.1f}s: {label}"
        elif event_type == "reconnect":
            ts = event.get("timestamp", 0)
            message = f"Reconnected to prior topic at {ts:.1f}s"

        if not message:
            return

        # Simple rate-limit to prevent Discord spam bursts.
        now = time.time()
        if now - self._last_sent_at < 1.5:
            return
        self._last_sent_at = now

        if self._config.webhook_url:
            await self._post_webhook_message(message)

        if self._config.bot_enabled and self._bot_running:
            await self._post_bot_message(message)

    async def _post_webhook_message(self, content: str) -> bool:
        payload = json.dumps({"content": content}).encode("utf-8")
        req = request.Request(
            self._config.webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        def _send() -> bool:
            try:
                with request.urlopen(req, timeout=8) as resp:
                    return 200 <= resp.status < 300
            except error.HTTPError as e:
                logger.warning("[DISCORD] HTTP error: %s", e)
                return False
            except Exception:
                logger.exception("[DISCORD] Failed to post message")
                return False

        return await asyncio.to_thread(_send)

    def _overlay_url(self) -> str:
        if not self._config.app_public_url:
            return ""
        parts = urlsplit(self._config.app_public_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query["overlay"] = "true"
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    def _normalize_public_url(self, value: str) -> str:
        url = (value or "").strip()
        if not url:
            return ""
        if "://" not in url:
            url = f"https://{url}"
        return url.rstrip("/")

    async def _post_bot_message(self, content: str) -> bool:
        if not self._bot_running or not self._bot_loop or not self._bot_client:
            return False
        if not self._subscribed_channel_ids:
            return False

        overlay = self._overlay_url()
        if overlay:
            content = f"{content}\n{overlay}"

        async def _send() -> bool:
            ok = False
            for channel_id in list(self._subscribed_channel_ids):
                channel = self._bot_client.get_channel(channel_id)
                if channel is None:
                    continue
                try:
                    await channel.send(content)
                    ok = True
                except Exception:
                    logger.exception("[DISCORD] Failed sending bot message to channel %s", channel_id)
            return ok

        fut = asyncio.run_coroutine_threadsafe(_send(), self._bot_loop)
        try:
            return bool(fut.result(timeout=10))
        except Exception:
            logger.exception("[DISCORD] Bot send failed")
            return False
