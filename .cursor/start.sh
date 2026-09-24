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
API_URL="$(printf '%s' "$STATUS_JSON" | grep -oP '"API_URL":"\K[^"]+')"
ANON_KEY="$(printf '%s' "$STATUS_JSON" | grep -oP '"ANON_KEY":"\K[^"]+')"

cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
NEXT_PUBLIC_BILLING_ENABLED=false
EOF

echo "==> Supabase ready at ${API_URL} (Studio: $(printf '%s' "$STATUS_JSON" | grep -oP '"STUDIO_URL":"\K[^"]+'))"
echo "==> start.sh complete"
