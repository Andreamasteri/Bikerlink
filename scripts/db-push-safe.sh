#!/bin/bash
# Task #2700 — Wrapper "fail-safe" attorno a `drizzle-kit push --force`.
# Task #2762 — Comportamento aggiornato a strict-fail per oggetti PostGIS.
#
# ARCHITETTURA DEI TRE LIVELLI DI DIFESA (Task #2762):
#   Livello 1: extensionsFilters: ["postgis"] in drizzle.config.ts
#              → drizzle-kit non genera MAI DDL su oggetti PostGIS
#   Livello 2: tablesFilter (non-PostGIS blacklist) in drizzle.config.ts
#              → esclude tabelle di app non gestite da drizzle-kit
#   Livello 3: questo script (db-push-safe.sh)
#              → pre-flight check su migration files + strict-fail runtime
#
# Comportamento di questo wrapper (post-Task #2762):
# 1. Pre-flight: scansiona migrations/*.sql per statement PostGIS eseguibili.
#    Se trovati, esce con errore PRIMA di toccare il database.
# 2. Esegue `drizzle-kit push --force` catturando stdout+stderr.
# 3. Se esce 0 → success.
# 4. Se l'output contiene qualsiasi riferimento a oggetti PostGIS noti
#    (spatial_ref_sys, geography_columns, geometry_columns) → HARD FAIL.
#    Con extensionsFilters attivo, questi oggetti NON dovrebbero MAI apparire
#    nell'output. Se appaiono significa che il livello 1 ha fallito e il
#    deploy non deve proseguire.
# 5. Qualsiasi altro errore → fail-fast con il codice originale.

set -uo pipefail

POSTGIS_OBJECTS_PATTERN='spatial_ref_sys|geography_columns|geometry_columns'
MIGRATIONS_DIR="$(dirname "$0")/../migrations"

# ─── PRE-FLIGHT: scansione migration files ──────────────────────────────────
if [ -d "$MIGRATIONS_DIR" ]; then
  echo "[db-push-safe] Pre-flight: scansione migration per statement PostGIS eseguibili…"
  offending=""
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] || continue
    # Rimuove commenti (--) poi cerca i pattern PostGIS nel codice eseguibile.
    if sed -e 's/--.*$//' "$f" | grep -nEi "$POSTGIS_OBJECTS_PATTERN" >/dev/null 2>&1; then
      hits=$(sed -e 's/--.*$//' "$f" | grep -nEi "$POSTGIS_OBJECTS_PATTERN")
      offending="${offending}\n  ${f}:\n${hits}\n"
    fi
  done

  if [ -n "$offending" ]; then
    echo "[db-push-safe] ERRORE pre-flight: trovati statement SQL eseguibili che referenziano oggetti PostGIS di sistema." >&2
    echo "Questi oggetti (spatial_ref_sys/geography_columns/geometry_columns) sono di proprietà del ruolo 'postgres'" >&2
    echo "e qualunque ALTER/DDL su di essi fa fallire il deploy in produzione con 'must be owner of table'." >&2
    echo "Rimuovi lo statement (lascia solo commenti) — la gestione di questi oggetti è demandata a" >&2
    echo "extensionsFilters: [\"postgis\"] in drizzle.config.ts (livello 1 di difesa)." >&2
    echo -e "Occorrenze:$offending" >&2
    exit 1
  fi
  echo "[db-push-safe] Pre-flight OK: nessuno statement PostGIS eseguibile nelle migration."
fi

# ─── RUNTIME: drizzle-kit push ──────────────────────────────────────────────
echo "[db-push-safe] Esecuzione: drizzle-kit push --force"

tmp_out=$(mktemp)
set +e
npx drizzle-kit push --force >"$tmp_out" 2>&1
rc=$?
set -e

cat "$tmp_out"

if [ $rc -eq 0 ]; then
  rm -f "$tmp_out"
  echo "[db-push-safe] OK."
  exit 0
fi

# ─── STRICT FAIL su oggetti PostGIS ─────────────────────────────────────────
# Con extensionsFilters: ["postgis"] attivo (livello 1), drizzle-kit NON dovrebbe
# generare alcun DDL su spatial_ref_sys/geography_columns/geometry_columns.
# Se questi oggetti appaiono nell'output in seguito a un errore, significa che
# il livello 1 ha fallito: si tratta di un errore reale, non benigno.
if grep -qEi "$POSTGIS_OBJECTS_PATTERN" "$tmp_out"; then
  echo "[db-push-safe] ERRORE CRITICO: drizzle-kit ha generato DDL su oggetti PostGIS di sistema." >&2
  echo "Questo NON dovrebbe accadere perché extensionsFilters: [\"postgis\"] è configurato in drizzle.config.ts." >&2
  echo "Azione richiesta:" >&2
  echo "  1. Verifica che extensionsFilters: [\"postgis\"] sia presente in drizzle.config.ts" >&2
  echo "  2. Verifica la versione di drizzle-kit (deve essere ≥ 0.30)" >&2
  echo "  3. Controlla che nessuna migration abbia statement PostGIS eseguibili" >&2
  echo "Il deploy è stato bloccato per evitare 'must be owner of table spatial_ref_sys' in produzione." >&2
  rm -f "$tmp_out"
  exit 1
fi

# ─── Qualsiasi altro errore: fail-fast ──────────────────────────────────────
echo "[db-push-safe] ERRORE drizzle-kit (exit $rc) — aborting." >&2
rm -f "$tmp_out"
exit $rc
