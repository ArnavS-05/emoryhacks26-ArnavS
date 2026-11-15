#!/usr/bin/env bash
# One-time setup on a fresh Vultr Cloud Compute instance (Ubuntu 22.04/24.04, >= 2 GB RAM).
#   1. Create the instance in the Vultr console; note its public IPv4.
#   2. scp your filled-in .env to the server:   scp .env root@<IP>:/root/synaphi.env
#   3. ssh root@<IP> 'bash -s' < deploy/vultr-setup.sh   (optionally: DOMAIN=your.domain)
set -euo pipefail
REPO="${REPO:-https://github.com/ArnavS-05/emoryhacks26-ArnavS.git}"
DIR=/opt/synaphi
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443 >/dev/null 2>&1 || true

if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR"
if [ ! -f .env ]; then
  [ -f /root/synaphi.env ] || { echo "Missing /root/synaphi.env — copy your .env first"; exit 1; }
  install -m 600 /root/synaphi.env .env
fi
grep -q '^SESSION_SIGNING_SECRET=.\+' .env || { echo "SESSION_SIGNING_SECRET must be set"; exit 1; }
grep -q '^CLINICIAN_ACCESS_CODE=.\+' .env || { echo "CLINICIAN_ACCESS_CODE must be set"; exit 1; }

DOMAIN="$DOMAIN" docker compose up -d --build
echo "Waiting for health..."
for i in $(seq 1 60); do curl -fsS "https://$DOMAIN/api/health" && break; sleep 5; done
echo
echo "Synaphi is deploying at: https://$DOMAIN   (judge demo: https://$DOMAIN/demo)"
