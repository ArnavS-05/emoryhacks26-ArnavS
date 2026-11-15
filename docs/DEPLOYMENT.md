# Deployment

## Option A — Vultr Cloud Compute (recommended)

1. **Rotate credentials first.** Keys shared during setup must be replaced (Gemini, Typesense admin + search, Tiger Data password). Generate fresh `SESSION_SIGNING_SECRET` (`python -c "import secrets;print(secrets.token_urlsafe(32))"`) and a strong `CLINICIAN_ACCESS_CODE`.
2. Create an Ubuntu 22.04/24.04 instance (≥ 2 GB RAM; 2 vCPU recommended for the frontend build) in the Vultr console. Note its IPv4.
3. Copy your production `.env` to the server: `scp .env root@<IP>:/root/synaphi.env`
4. Run setup from your machine:
   ```bash
   ssh root@<IP> 'bash -s' < deploy/vultr-setup.sh
   # or with a custom domain whose A record points at <IP>:
   ssh root@<IP> 'DOMAIN=synaphi.example.com bash -s' < deploy/vultr-setup.sh
   ```
   Without a domain the script uses `<ip-with-dashes>.sslip.io`, which still gets a real Let's Encrypt certificate (HTTPS is required for camera and microphone access).
5. Open `https://<domain>/demo` and `https://<domain>/inspect`.

Updating: `ssh root@<IP> 'cd /opt/synaphi && git pull && docker compose up -d --build'`.

### What runs
- `app`: multi-stage image — Node 22 builds the React SPA (and caches MediaPipe WASM + face model locally), Python 3.12-slim runs FastAPI/uvicorn as a non-root user, single worker (in-process WebSocket hub), healthcheck on `/api/health`.
- `caddy`: TLS termination, HTTP/3, gzip/zstd, HSTS, WebSocket proxying.
- Volumes: uploads, Caddy certificates.

### Production environment
`APP_ENV=production` requires `SESSION_SIGNING_SECRET` and `CLINICIAN_ACCESS_CODE`, disables `/api/docs`, and enables CSP. Set `ENABLE_DEMO=false` after judging.

## Option B — any Docker host
```bash
cp .env.example .env   # fill in
DOMAIN=your.domain docker compose up -d --build
```

## Option C — single process (no Docker)
```bash
cd frontend && npm ci && npm run build
cd ../backend && APP_ENV=production uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```
FastAPI serves the built SPA from `frontend/dist`. Put a TLS proxy in front.

## Verification status
- Production serving mode verified locally: built SPA, CSP headers, unknown `/api/*` → 404, HEAD support, MediaPipe WASM under CSP, both E2E suites passing.
- **Docker images and the Vultr script have not been executed** (Docker unavailable on the development machine; no Vultr instance yet).

## Custom domain (GoDaddy Registry)
Register the domain, add an `A` record → Vultr IPv4 (and optionally `AAAA`), wait for DNS, then deploy with `DOMAIN=<domain>`. Caddy obtains and renews certificates automatically.
