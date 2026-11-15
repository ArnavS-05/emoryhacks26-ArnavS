# ---- 1. Build the React frontend ----
FROM node:22-alpine AS web
WORKDIR /app
COPY scripts/copy-mediapipe.mjs scripts/
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend frontend
# prebuild copies the MediaPipe WASM runtime and caches the face model so blink/head tracking needs no CDN
RUN cd frontend && npm run build

# ---- 2. Python runtime: FastAPI serves the API, WebSockets and the built SPA ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=web /app/frontend/dist frontend/dist
RUN useradd --create-home --uid 10001 synaphi && mkdir -p backend/uploads && chown -R synaphi /app
USER synaphi
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
# Single worker on purpose: the WebSocket session hub is in-process.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
