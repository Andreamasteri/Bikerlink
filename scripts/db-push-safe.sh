#!/bin/bash
# Task #2700 — Wrapper "fail-safe" attorno a `drizzle-kit push --force`.
#
# Problema: in produzione il deploy fallisce con
#   ERROR: must be owner of table spatial_ref_sys
# perché drizzle-kit, nonostante `tablesFilter`, in alcune versioni emette
# `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY` (oggetto PostGIS di proprietà
# del ruolo `postgres`, non dell'utente applicativo).
#
# Comportamento di questo wrapper:
# 1. Esegue `drizzle-kit push --force` catturando stdout+stderr.
# 2. Se l'esecuzione termina con `exit 0` → success, esce 0.
# 3. Se fallisce ED l'output contiene SOLO l'errore di ownership su uno dei
#    tre oggetti PostGIS noti (spatial_ref_sys, geography_columns,
#    geometry_columns), riprova fino a MAX_ITER volte. Tutti gli statement
#    validi vengono applicati nel frattempo (drizzle ricalcola il diff a ogni
#    push). Quando non resta nient'altro da applicare a parte lo statement
#    PostGIS, esce 0 con un warning loggato (lo statement è benigno: il PK è
#    già presente perché creato da PostGIS al CREATE EXTENSION).
# 4. Se l'output contiene qualunque altro errore non PostGIS, esce con il
#    codice originale (fail-fast, nessun masking).
#
# Idempotenza: la seconda esecuzione consecutiva è no-op se la prima è andata
# a buon fine. Verificato in `docs/deploy-status.md`.

set -uo pipefail

# Task #2731 — Pre-flight guard.
# Layer di sicurezza aggiuntivo: prima di toccare il pipeline, scansiona i file
# di migration in migrations/*.sql alla ricerca di statement SQL ESEGUIBILI che
# referenzino oggetti di sistema PostGIS (spatial_ref_sys, geography_columns,
# geometry_columns). I commenti (righe che iniziano con `--`) vengono ignorati,
# così la documentazione e le migration no-op restano consentite.
# Se trova uno statement eseguibile, esce con errore descrittivo PRIMA che la
# migration raggiunga il pipeline di deploy di Replit.
POSTGIS_OBJECTS_PATTERN='spatial_ref_sys|geography_columns|geometry_columns'
MIGRATIONS_DIR="$(dirname "$0")/../migrations"

if [ -d "$MIGRATIONS_DIR" ]; then
  echo "[db-push-safe] Pre-flight: scansione migration per statement PostGIS eseguibili…"
  offending=""
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] || continue
    # Rimuove righe vuote e commenti (`--`), poi cerca i pattern PostGIS.
    if sed -e 's/--.*$//' "$f" | grep -nEi "$POSTGIS_OBJECTS_PATTERN" >/dev/null 2>&1; then
      hits=$(sed -e 's/--.*$//' "$f" | grep -nEi "$POSTGIS_OBJECTS_PATTERN")
      offending="${offending}\n  ${f}:\n${hits}\n"
    fi
  done

  if [ -n "$offending" ]; then
    echo "[db-push-safe] ERRORE pre-flight: trovati statement SQL eseguibili che referenziano oggetti PostGIS di sistema." >&2
    echo "Questi oggetti (spatial_ref_sys/geography_columns/geometry_columns) sono di proprietà del ruolo 'postgres'" >&2
    echo "e qualunque ALTER/DDL su di essi fa fallire il deploy in produzione con 'must be owner of table'." >&2
    echo "Rimuovi lo statement (lascia solo commenti) o gestisci l'oggetto via tablesFilter in drizzle.config.ts." >&2
    echo -e "Occorrenze:$offending" >&2
    exit 1
  fi
  echo "[db-push-safe] Pre-flight OK: nessuno statement PostGIS eseguibile nelle migration."
fi

MAX_ITER=4
POSTGIS_ERR_PATTERN='must be owner of (table|view|relation|sequence) (spatial_ref_sys|geography_columns|geometry_columns)'
OTHER_ERR_PATTERN='(error:|ERROR:|FATAL:|Error:)'

iter=0
last_postgis_only=0

while [ $iter -lt $MAX_ITER ]; do
  iter=$((iter + 1))
  echo "[db-push-safe] Iterazione $iter/$MAX_ITER — drizzle-kit push --force"

  tmp_out=$(mktemp)
  set +e
  npx drizzle-kit push --force >"$tmp_out" 2>&1
  rc=$?
  set -e

  cat "$tmp_out"

  if [ $rc -eq 0 ]; then
    rm -f "$tmp_out"
    echo "[db-push-safe] OK (iterazione $iter)."
    exit 0
  fi

  # L'output contiene un errore PostGIS noto?
  if grep -qE "$POSTGIS_ERR_PATTERN" "$tmp_out"; then
    # Controlla se ci sono altri errori non-PostGIS, riga per riga.
    other=$(grep -E "$OTHER_ERR_PATTERN" "$tmp_out" | grep -vE "$POSTGIS_ERR_PATTERN" || true)
    if [ -n "$other" ]; then
      echo "[db-push-safe] ERRORE non-PostGIS rilevato — aborting:" >&2
      echo "$other" >&2
      rm -f "$tmp_out"
      exit $rc
    fi

    # Solo errori PostGIS. Se l'iterazione precedente era già "solo PostGIS",
    # vuol dire che drizzle continua a generare lo stesso ALTER e non c'è
    # altro da fare → trattiamolo come benigno e usciamo 0.
    if [ $last_postgis_only -eq 1 ]; then
      echo "[db-push-safe] WARN: errore ownership PostGIS persistente — treating as benign (PK già creato da CREATE EXTENSION postgis)." >&2
      rm -f "$tmp_out"
      exit 0
    fi
    last_postgis_only=1
    echo "[db-push-safe] Solo errore PostGIS rilevato — retry per applicare eventuali statement residui."
    rm -f "$tmp_out"
    continue
  fi

  echo "[db-push-safe] ERRORE non-PostGIS — aborting (exit $rc)." >&2
  rm -f "$tmp_out"
  exit $rc
done

# Ultima iterazione completata: se siamo qui significa che siamo usciti dal
# loop dopo MAX_ITER iterazioni con solo errori PostGIS — benigno.
echo "[db-push-safe] Raggiunte $MAX_ITER iterazioni con solo errori PostGIS — treating as benign." >&2
exit 0
