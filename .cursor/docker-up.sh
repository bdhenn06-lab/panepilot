#!/usr/bin/env bash
# Bring up the Docker daemon inside the (nested) Cloud Agent VM.
#
# Two things are different from a normal host and both are handled here:
#   1. Native overlayfs cannot be mounted in this nested VM, so Docker is
#      configured (in install.sh) to use the fuse-overlayfs storage driver.
#   2. Container-to-container traffic on Docker bridge networks is dropped in
#      the FORWARD chain unless bridged frames bypass iptables. Supabase's
#      services all talk to Postgres over such a network, so we must relax
#      net.bridge.bridge-nf-call-iptables before the stack starts.
set -euo pipefail

sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true

if ! sudo docker info >/dev/null 2>&1; then
  echo "==> starting dockerd"
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 60); do
    if sudo docker info >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

# Let non-root tooling (the supabase CLI) reach the daemon socket.
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

if ! docker info >/dev/null 2>&1; then
  echo "!! dockerd did not become ready; see /var/log/dockerd.log" >&2
  exit 1
fi
