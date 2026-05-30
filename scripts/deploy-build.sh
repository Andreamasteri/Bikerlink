#!/bin/bash
set -e

# Task #1150 — deploy build minimale.
#
# Storia: lo script ha avuto in passato uno step `npx expo export --platform web`
# (4.8 MB di JS in static-build/web/) e poi un marker statico static-build/index.html.
# Entrambi sono stati rimossi: BikerLink non gira via web, server/index.ts non
# referenzia più static-build, e la cartella confondeva il classifier autoscale di
# Replit.
#
# Task #2678 – #2800 — la sincronizzazione schema avviene tramite server/migrate.ts
# (legge migrations/0001-NNN.sql, traccia in schema_migrations, gira a ogni boot).
# Regola: ogni cambio schema → file .sql numerato in migrations/ → commit.

# Task #2800-fix — Pulizia asset non necessari prima del push del Repl layer.
# attached_assets/ contiene screenshot del workspace Replit (usati dall'agente
# per riferimento visivo) che crescono nel tempo e gonfiano il Repl layer fino
# a superare il limite Cloud Run (~2 GB), facendo fallire silenziosamente
# "Creating Autoscale service" senza alcun log di errore.
# Questi file non servono a runtime: il server Express non li serve.
# La pulizia avviene PRIMA del build così il layer risultante è snello.
echo "=== [0/3] Pulizia asset workspace non necessari ==="
rm -rf attached_assets/
mkdir -p attached_assets   # ricrea la dir vuota (evita errori se qualcuno la referenzia)
echo "  attached_assets/ svuotata."

# Task #2820-fix — Pulizia .local/state/replit/ prima del push del Repl layer.
# .local/state/replit/ contiene transcript dell'agente AI (~376 MB) e un database
# di query log (log-query.db, ~124 MB) che crescono nel tempo.
# Questi file NON servono a runtime: il server Express non li usa.
# Senza questa pulizia il Repl layer supera il limite Cloud Run (~2 GB), causando
# il fallimento silenzioso di "Creating Autoscale service" senza alcun log.
# Misurato: .local/state/replit/ = 504 MB → Repl layer totale ~1.7 GB → KO.
# Dopo la pulizia: ~1.2 GB → ampiamente sotto il limite.
echo "=== [1/3] Pulizia .local/state/ (transcript agente + log DB) ==="
rm -rf .local/state/replit/
rm -rf .local/state/scribe/
rm -rf .local/state/workflow-logs/
echo "  .local/state/replit/, scribe/ e workflow-logs/ rimossi (non necessari a runtime)."

echo "=== [2/3] Build server TypeScript ==="
node scripts/server-build.js

# Task #2781-fix — invalida la cache hash delle migration.
# server/migrate.ts ha un fast-skip basato su server_dist/.migrations-hash
# (hash dei nomi file). In produzione il filesystem PERSISTE tra i deploy:
# una cache vecchia (ferma a 0061) combaciava con l'hash corrente e faceva
# saltare l'intero controllo DB ("cache hit — schema hash unchanged"),
# impedendo l'esecuzione di nuove migration DML come 0062.
# Rimuovendo il file qui, al primo avvio il runner fa SEMPRE il round-trip
# sul DB e confronta con schema_migrations (la vera fonte di verità).
rm -f server_dist/.migrations-hash
echo "  Cache migration invalidata (forza controllo DB al boot)."

echo "=== [3/3] Deploy build completato ==="
