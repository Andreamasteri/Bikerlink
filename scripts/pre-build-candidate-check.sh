#!/usr/bin/env bash
set -euo pipefail

# Candidate-only offline preflight. No database, Railway, R2 or Replit access.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

errors=0
fail() { echo "✖ $1" >&2; errors=$((errors + 1)); }
ok() { echo "✔ $1"; }

if [[ -f package-lock.json ]] && grep -q "package-firewall.replit.local" package-lock.json; then
  fail "package-lock.json contiene URL proxy Replit"
else
  ok "package-lock.json senza proxy Replit"
fi

for path in package.json app.json eas.json scripts/eas.sh server/migrate.ts migrations; do
  if [[ -e "$path" ]]; then ok "presente: $path"; else fail "manca: $path"; fi
done

if [[ -n "${EXPO_PUBLIC_DOMAIN:-}" && "${EXPO_PUBLIC_DOMAIN}" == "https://biker-link.net" ]]; then
  fail "EXPO_PUBLIC_DOMAIN punta a Production"
elif [[ -n "${EXPO_PUBLIC_DOMAIN:-}" ]]; then
  ok "EXPO_PUBLIC_DOMAIN non punta a Production"
else
  echo "⚠ EXPO_PUBLIC_DOMAIN non impostato: obbligatorio per la build Candidate"
fi

if [[ -n "${R2_ENDPOINT:-}" || -n "${R2_PUBLIC_BUCKET:-}" ]]; then
  for name in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_BUCKET R2_PRIVATE_BUCKET R2_PUBLIC_BASE_URL; do
    [[ -n "${!name:-}" ]] || fail "variabile R2 mancante: $name"
  done
else
  echo "⚠ credenziali R2 non presenti: la copia Replit→R2 resta da eseguire separatamente"
fi

if (( errors > 0 )); then
  echo "CANDIDATE_PREFLIGHT=FAILED"
  exit 1
fi
echo "CANDIDATE_PREFLIGHT=READY_WITH_EXTERNAL_STEPS"
