# HopTopiic Local Mode & GitHub Pages Deployment Guide

## Overview

HopTopiic now supports **Local Mode**, a frontend-only operation mode that runs entirely in your browser using the Web Speech API for transcription. This makes it perfect for deployment on GitHub Pages without needing a backend server.

## Local Mode Features

- ✅ **Browser-based STT** — Uses Web Speech API (Chrome, Edge, Safari)
- ✅ **Infer-and-forget audio** — Audio chunks are processed and immediately discarded (no storage)
- ✅ **In-memory state** — All events stored in browser memory
- ✅ **Event export** — Download conversation as JSON or NDJSON
- ✅ **No backend required** — Fully offline-capable
- ✅ **Optional Discord bot** — Can connect to your Discord server if desired

## Quick Start

### 1. Toggle Local Mode

In the HopTopiic UI:
- Open **Settings** (gear icon in header)
- Switch to **💻 Local** mode (instead of 🔗 Backend)
- Recording will use Web Speech API instead of backend server

### 2. Record & Export

1. Click **⏺ Start** to begin recording
2. Speak into your microphone
3. Segments appear in the transcript panel in real-time
4. Topics are extracted automatically
5. Click **JSON** or **NDJSON** to download your conversation

### 3. Folder Structure

```
HopTopiic/
├── frontend/              # Vite React app
│   ├── src/
│   │   ├── App.tsx       # Main UI (includes Local Mode toggle)
│   │   ├── components/
│   │   │   ├── ExportPanel.tsx      # Download events
│   │   │   ├── TranscriptPanel.tsx  # Live transcript
│   │   │   └── SettingsPanel.tsx    # Local Mode toggle here
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts      # Disabled in Local Mode
│   │   │   └── WebSpeechTranscriber.ts  # Web Speech API adapter
│   │   ├── providers.ts             # Provider interfaces
│   │   ├── store/
│   │   │   └── conversationStore.ts # Zustand store (localMode flag)
│   │   └── utils/
│   │       └── AudioBuffer.ts       # Infer-and-forget buffer
│   ├── vite.config.ts
│   └── package.json
└── backend/               # (Optional) Only needed if using Backend mode
```

## Deployment: GitHub Pages

### Option A: Deploy from Your Machine

1. **Build the frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   Output: `frontend/dist/` folder

2. **Deploy to GitHub Pages:**
   ```bash
   # Option 1: Use GitHub Actions (recommended)
   # Create .github/workflows/deploy.yml with Vite + GitHub Pages action
   
   # Option 2: Manual upload
   # Push dist/ folder contents to gh-pages branch
   git subtree push --prefix frontend/dist origin gh-pages
   ```

3. **Access your app:**
   ```
   https://<your-username>.github.io/HopTopiic
   ```

### Option B: Automated GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: cd frontend && npm install
      
      - name: Build
        run: cd frontend && npm run build
      
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./frontend/dist
```

Then push to trigger automatic deployment.

## Local Mode Architecture

### Data Flow (Local Mode)

```
🎤 Microphone
    ↓
[Web Speech API] — Transcribes in browser
    ↓
TranscriptMessage
    ↓
[Zustand Store] — In-memory state
    ↓
UI Updates + [Memory Event Sink]
    ↓
📥 Export (JSON/NDJSON)
```

### Audio Buffer (Infer-and-Forget)

- **Max size:** 10 seconds of audio (configurable)
- **Behavior:** FIFO circular buffer
- **Processing:** Web Speech API handles audio directly from getUserMedia
- **Memory:** Chunks discarded immediately after transcription

### Provider Pattern

HopTopiic uses pluggable providers for future flexibility:

```typescript
// Current implementation:
- WebSpeechTranscriber — Browser STT
- MemoryEventSink — In-memory event storage

// Future implementations could add:
- BackendTranscriber — Connect to backend server
- CloudSTT — Use cloud STT (Google, Azure, etc.)
- LocalStorage — Persist events to IndexedDB
```

## Features Comparison

| Feature | Local Mode | Backend Mode |
|---------|-----------|--------------|
| STT | Web Speech API | Backend (Vosk, etc.) |
| Speaker ID | Not implemented | Backend with diarization |
| NLP Topics | (Client-side in future) | Backend spaCy |
| Mood Detection | (Future) | Backend VADER |
| Audio Storage | No (ephemeral) | Yes (server-side) |
| Deployment | GitHub Pages | Server required |
| Offline | ✅ Yes | ❌ No |
| Latency | Low (client-side) | Higher (network) |

## Exporting Data

### JSON Format

```json
{
  "export": {
    "timestamp": "2026-05-06T14:30:00.000Z",
    "nodeCount": 5,
    "segmentCount": 23
  },
  "events": [
    {
      "type": "topic",
      "timestamp": 1715000000000,
      "data": {
        "id": "t1",
        "label": "Weather discussion",
        "timestamp": 0,
        "parentId": null,
        ...
      }
    },
    {
      "type": "transcript",
      "timestamp": 1715000001000,
      "data": {
        "text": "It's going to rain today",
        "start": 0.5,
        "end": 2.1,
        "topicId": "t1",
        "speaker": "Speaker 1"
      }
    }
  ]
}
```

### NDJSON Format

One event per line (easier for streaming/processing):

```ndjson
{"type":"topic","timestamp":1715000000000,"data":{...}}
{"type":"transcript","timestamp":1715000001000,"data":{...}}
{"type":"topic","timestamp":1715000002000,"data":{...}}
```

Use NDJSON for large exports or when streaming to backend for processing.

## Troubleshooting

### Web Speech API Not Working

**Issue:** "Web Speech API not supported in this browser"

**Solution:**
- Use Chrome, Edge, or Safari (Firefox has limited support)
- Check if you're on HTTPS (required for getUserMedia)
- Allow microphone permissions when prompted

### Nothing Happens When I Click Start

**Issue:** Recording doesn't begin

**Solution:**
1. Check browser console (F12 → Console tab)
2. Verify microphone permissions (🎤 icon in address bar)
3. Try in Chrome/Edge if using Firefox
4. Check if Web Speech API is enabled (chrome://flags → Search "Speech")

### Export Button Disabled

**Issue:** JSON/NDJSON buttons are grayed out

**Solution:**
- Start recording and add some transcript segments first
- The export buttons only enable when there's data to export

## Next Steps / Future Enhancements

### Phase 1 (Current)
- ✅ Local Mode toggle
- ✅ Web Speech API STT
- ✅ Event export (JSON/NDJSON)
- ✅ In-memory state
- ✅ GitHub Pages compatible

### Phase 2 (Optional Backend)
- [ ] Add "Connect to Backend" button in Local Mode
- [ ] Sync events to backend on-demand
- [ ] Add client-side NLP (TensorFlow.js)
- [ ] Add speaker labels (Silero Speaker ID)
- [ ] IndexedDB persistence

### Phase 3 (Advanced)
- [ ] Service Worker for offline support
- [ ] IndexedDB for unlimited event history
- [ ] Custom speaker profiles
- [ ] Event search & filtering
- [ ] Export to markdown / PDF

## Environment Variables (Optional)

For GitHub Pages deployment, no env vars needed. If you later add backend support:

```bash
# .env.local (not committed)
VITE_BACKEND_URL=http://localhost:8000
VITE_PUBLIC_APP_URL=https://yourusername.github.io/HopTopiic
```

## Support

### Issues?

1. Check browser console (F12)
2. Open GitHub Issues with:
   - Browser & OS version
   - Error messages from console
   - Steps to reproduce
   - Local Mode vs Backend mode (which one fails?)

### Want to Contribute?

See `CONTRIBUTING.md` for development setup and running locally.

---

**Happy Recording! 🐇 HopTopiic**
