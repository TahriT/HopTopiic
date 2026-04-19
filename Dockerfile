# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:22-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend + serve static frontend ────────────────────
FROM python:3.12-slim

# System deps for sounddevice (ALSA/PortAudio) and model downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    libportaudio2 \
    libasound2-dev \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Download spaCy language model at build time
RUN python -m spacy download en_core_web_md

# Copy backend code
COPY backend/ ./backend/

# Download Vosk models at build time so container starts fast
RUN python -c "\
import sys; sys.path.insert(0, '.'); \
from backend.transcriber import _download_model, MODEL_DIR, MODEL_NAME, SPK_MODEL_NAME; \
_download_model(MODEL_NAME, MODEL_DIR); \
_download_model(SPK_MODEL_NAME, MODEL_DIR); \
print('Vosk models downloaded')"

# Copy built frontend static files
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000

# Run the backend (it also serves the frontend static files)
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
