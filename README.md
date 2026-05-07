# 🐇 HopTopicc

**Live conversation topic tracker** — listen to speech in your browser, visualise topic changes in real time, and optionally post hop notifications to a Discord channel.

🔗 **[Live demo → tahrit.github.io/HopTopicc](https://tahrit.github.io/HopTopicc/)**

---

## What it does

HopTopicc uses the browser's built-in Web Speech API to transcribe your microphone in real time. A local inference engine watches the transcript for:

- **Transition phrases** — "speaking of", "by the way", "anyway", etc.
- **Keyword drift** — Jaccard similarity drops below 12% over a rolling window

When a topic change is detected, a new node appears in the conversation graph and (optionally) a notification fires to your connected Discord channel.

No audio ever leaves your device. All processing runs locally in the browser.

---

## Features

- 🎙️ Real-time speech transcription (Web Speech API, browser-native)
- 🗺️ Interactive topic graph (React Flow)
- 🤖 Local topic inference — keyword drift + transition phrase detection
- 💬 Discord integration — OAuth2 webhook, posts topic-hop embeds
- 🌐 Runs entirely in the browser — no backend required in Local Mode
- 🐳 Optional self-hosted backend (FastAPI + Docker) for extended features

---

## Quick start (Local Mode)

No installation needed — just open the live demo in Chrome or Edge:

> **[tahrit.github.io/HopTopicc](https://tahrit.github.io/HopTopicc/)**

1. Click **Start Recording**
2. Allow microphone access
3. Talk — topic nodes appear automatically

---

## Run locally (development)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Run tests

```bash
cd frontend
npm test
```

---

## Self-hosted with Docker

```bash
.\deploy-docker.ps1
```

Or manually:

```bash
docker compose up --build
```

App runs at [http://localhost:8000](http://localhost:8000).

---

## Discord integration

1. Click **Connect Discord** in the app header
2. Authorise HopTopicc to post to a channel (uses the `webhook.incoming` scope — read-only access, no message history)
3. Topic hops and session starts appear as embeds in your chosen channel

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Graph | @xyflow/react (React Flow) |
| State | Zustand 5 |
| Speech | Web Speech API |
| Tests | Vitest 4 + jsdom + Testing Library |
| Backend (optional) | FastAPI, Python |
| Deploy | GitHub Actions → GitHub Pages |

---

## Pages

- [Terms of Service](https://tahrit.github.io/HopTopicc/tos.html)
- [Privacy Policy](https://tahrit.github.io/HopTopicc/privacy.html)
