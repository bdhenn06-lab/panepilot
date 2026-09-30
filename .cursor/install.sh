#!/usr/bin/env bash
# One-time (per-build) setup: system packages, the Supabase CLI, Node deps, and
# a warm cache of the Supabase local-stack Docker images. Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing system packages (docker, fuse-overlayfs, iptables)"
if ! command -v docker >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::=--force-confold \
    docker.io fuse-overlayfs uidmap iptables
fi

# Native overlayfs can't be mounted in the nested VM; use fuse-overlayfs.
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"features":{"containerd-snapshotter":false},"storage-driver":"fuse-overlayfs"}' \
    | sudo tee /etc/docker/daemon.json >/dev/null
fi

echo "==> Installing the Supabase CLI"
if ! command -v supabase >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)"
  VER="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
    | grep -oP '"tag_name": "\K[^"]+')"
  curl -fsSL \
    "https://github.com/supabase/cli/releases/download/${VER}/supabase_${VER#v}_linux_${ARCH}.deb" \
    -o /tmp/supabase.deb
  sudo dpkg -i /tmp/supabase.deb
fi

echo "==> Installing Node dependencies (npm ci)"
npm ci

echo "==> Warming the Supabase image cache"
# Best effort: pull the local-stack images now so they are baked into the
# environment build snapshot and boots are fast. A failure here is non-fatal;
# start.sh will pull on demand instead.
if "$REPO_ROOT/.cursor/docker-up.sh"; then
  supabase start >/tmp/supabase-warm.log 2>&1 || true
  supabase stop --no-backup >/dev/null 2>&1 || true
fi

echo "==> install.sh complete"
