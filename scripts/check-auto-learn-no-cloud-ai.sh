#!/usr/bin/env bash
# check-auto-learn-no-cloud-ai.sh
#
# Task #5336 — gate statico che blocca qualsiasi import futuro di un provider
# AI cloud (Groq/Gemini/OpenAI) dentro il job di auto-apprendimento LOCALE di
# Bowie (server/ai/assistant/auto-learn.ts).
#
# Perché: Task #5330 ha aggiunto un test runtime che verifica che il ciclo di
# auto-learn non usi mai un provider cloud, ma quel test scatta SOLO se il
# modulo cloud viene davvero importato e invocato a runtime (mock-bypassabile).
# Questo gate è più economico e non bypassabile: fallisce a lint/CI time se
# auto-learn.ts anche solo IMPORTA uno dei moduli cloud, prima che il codice
# giri.
#
# Import vietati in server/ai/assistant/auto-learn.ts:
#   - server/ai/moderation/provider.ts (runWithFallback = entrypoint cloud)
#   - server/lib/groq-client.ts
#   - server/lib/openai-route-client.ts
#   - qualunque modulo che esponga un client Gemini (google/generative-ai,
#     @google/genai, lib/gemini-client)
#
# Import consentito per la generazione: SOLO callOllamaChat / ollama-client.
#
# Invariante: server/ai/assistant/auto-learn.ts DEVE restare cloud-import-free.
# Vedi: .agents/memory (ai-provider-chain-strategy.md, ai-audit-logging.md)

set -euo pipefail

TARGET="server/ai/assistant/auto-learn.ts"

echo "🔍 Controllo che $TARGET non importi provider AI cloud..."

if [ ! -f "$TARGET" ]; then
  echo "⚠️  $TARGET non trovato — gate saltato (nessun file da controllare)."
  exit 0
fi

FAIL=0

# Pattern di import vietati (moduli cloud o il gateway runWithFallback).
declare -a FORBIDDEN_PATTERNS=(
  'moderation/provider'
  'lib/groq-client'
  'lib/openai-route-client'
  'lib/gemini-client'
  '@google/generative-ai'
  '@google/genai'
  '@ai-sdk/openai'
  '@ai-sdk/google'
  'runWithFallback'
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  MATCHES=$(rg -n -- "$pattern" "$TARGET" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo ""
    echo "❌ TROVATO — import/uso vietato di provider AI cloud in $TARGET"
    echo "   Pattern: $pattern"
    echo "$MATCHES"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "💥 check-auto-learn-no-cloud-ai FALLITO"
  echo ""
  echo "   Il job di auto-apprendimento locale di Bowie ($TARGET) DEVE restare"
  echo "   cloud-import-free: usa ESCLUSIVAMENTE il modello Ollama locale"
  echo "   (callOllamaChat / ollama-client), MAI Groq/Gemini/OpenAI né il"
  echo "   gateway runWithFallback (server/ai/moderation/provider.ts)."
  echo ""
  echo "   Questo invariante è intenzionale: l'auto-apprendimento non deve mai"
  echo "   generare costi cloud né dipendere da provider esterni."
  echo ""
  echo "   FIX: rimuovere l'import cloud e usare solo callOllamaChat/isOllamaConfigured"
  echo "   da server/lib/ollama-client."
  exit 1
fi

echo "✅ $TARGET non importa alcun provider AI cloud."
