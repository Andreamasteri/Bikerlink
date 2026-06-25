#!/usr/bin/env bash
# ── GATE: nessun placeholder __TODO__ nelle traduzioni di produzione ──────────
#
# Contesto (task #4959): in lib/i18n/it.ts un blocco di ~950 placeholder
# "__TODO__:chiave" era spreddato DOPO ...part1..4. Poiché l'aggregatore fa
# prima lo spread dei file part e POI le proprie chiavi, ogni placeholder
# OMBREGGIAVA silenziosamente la traduzione reale: l'utente vedeva
# "__TODO__:chiave" invece del testo tradotto.
#
# Il fix dei DUPLICATI intra-file è gestito da scripts/fix-i18n-todo-duplicates.ts,
# che però NON cattura l'ombreggiamento CROSS-FILE (it.ts vs it.part*.ts).
# Questo gate è la rete finale: vieta qualsiasi "__TODO__" residuo in lib/i18n/.
#
# Exit 0 = pulito; Exit 1 = trovati placeholder (stampa file:riga).

set -euo pipefail

I18N_DIR="lib/i18n"

if [ ! -d "$I18N_DIR" ]; then
  echo "  ℹ️  $I18N_DIR non trovato — skip gate __TODO__."
  exit 0
fi

MATCHES=$(grep -rn "__TODO__" "$I18N_DIR" --include="*.ts" 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  COUNT=$(printf '%s\n' "$MATCHES" | grep -c "__TODO__" || true)
  echo "❌ Trovati ${COUNT} placeholder __TODO__ nelle traduzioni (lib/i18n/):"
  printf '%s\n' "$MATCHES"
  echo ""
  echo "   Ogni '__TODO__:chiave' mostra il placeholder all'utente invece della traduzione."
  echo "   → Se la traduzione reale esiste già in un altro file i18n, rimuovi la riga."
  echo "   → Altrimenti sostituisci il valore con la traduzione corretta."
  exit 1
fi

echo "  ✅ Nessun placeholder __TODO__ nelle traduzioni i18n."
exit 0
