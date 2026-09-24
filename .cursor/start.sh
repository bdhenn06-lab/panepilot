#!/usr/bin/env bash
# Per-boot bring-up: start Docker, start the Supabase local stack, and point the
# Next.js app at it via .env.local. Must be idempotent and must return.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Starting Docker daemon"
"$REPO_ROOT/.cursor/docker-up.sh"

echo "==> Starting the Supabase local stack (migrations apply automatically)"
supabase start

echo "==> Writing .env.local from Supabase status"
STATUS_JSON="$(supabase status -o json)"
# `supabase status -o json` is pretty-printed (a space follows each colon), so
# the patterns must tolerate optional whitespace.
API_URL="$(printf '%s' "$STATUS_JSON" | grep -oP '"API_URL":\s*"\K[^"]+')"
ANON_KEY="$(printf '%s' "$STATUS_JSON" | grep -oP '"ANON_KEY":\s*"\K[^"]+')"
STUDIO_URL="$(printf '%s' "$STATUS_JSON" | grep -oP '"STUDIO_URL":\s*"\K[^"]+')"

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ]; then
  echo "!! could not parse Supabase status; not overwriting .env.local" >&2
  printf '%s\n' "$STATUS_JSON" >&2
  exit 1
fi

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
NEXT_PUBLIC_BILLING_ENABLED=false
EOF

echo "==> Supabase ready at ${API_URL} (Studio: ${STUDIO_URL})"
echo "==> start.sh complete"
