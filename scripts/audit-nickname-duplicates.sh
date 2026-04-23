#!/usr/bin/env bash
# Audit: Verifica nickname duplicati (case-insensitive) nel DB
# Task: #865
# Esecuzione: bash scripts/audit-nickname-duplicates.sh
#
# Eseguito il 2026-04-23: 0 duplicati trovati (DB pulito post-fix #863)

set -euo pipefail

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Avvio audit nickname duplicati (case-insensitive)..."

RESULT=$(psql "$DATABASE_URL" -t -A -c \
  "SELECT LOWER(nickname), COUNT(*) FROM users GROUP BY LOWER(nickname) HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC;")

if [ -z "$RESULT" ]; then
  echo "[$TIMESTAMP] OK: Nessun nickname duplicato trovato."
  exit 0
else
  echo "[$TIMESTAMP] ATTENZIONE: Trovati nickname duplicati (case-insensitive):"
  echo "$RESULT"
  echo ""
  echo "Rinomina manuale con suffisso numerico (es. Mendo_2) oppure esegui la fix automatica."
  exit 1
fi
