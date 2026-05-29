#!/bin/bash
# Task #2700 — Wrapper "fail-safe" attorno a `drizzle-kit push --force`.
# Task #2762 — Comportamento aggiornato a strict-fail per oggetti PostGIS.
# Task #2778 — REGRESSIONE Task #2762: il comportamento strict-fail si è
#              rivelato troppo aggressivo. In drizzle-kit 0.31.x,
#              extensionsFilters non è affidabile al 100% e può non filtrare
#              gli oggetti PostGIS. Quando l'unico errore riguarda oggetti
#              PostGIS (spatial_ref_sys/geography_columns/geometry_columns),
#              il comportamento corretto è un warning benigno + exit 0,
#              come era in Task #2700 prima della stretta di Task #2762.
#              Se invece l'output contiene ANCHE altri errori non-PostGIS,
#              il fail-fast viene mantenuto per non mascherare bug reali.
# BUG FIX (2026-05-29) — Il grep -v sul POSTGIS_OBJECTS_PATTERN rimuoveva
#              solo le righe con il nome della tabella PostGIS, ma lasciava
#              "Failed to run database migration statement" (la riga precedente)
#              nel testo stripped. Il successivo grep "failed" la trovava e
#              scattava il fail-fast anche quando l'unico errore era PostGIS.
#              Fix: usa perl per rimuovere l'intero blocco di 3 righe
#              "Failed...\nDDL_postgis\nowner_error" prima di cercare errori.
#
# ARCHITETTURA DEI TRE LIVELLI DI DIFESA (Task #2778):
#   Livello 1: extensionsFilters: ["postgis"] in drizzle.config.ts
#              → drizzle-kit non genera MAI DDL su oggetti PostGIS (se funziona)
#   Livello 2: tablesFilter con "!spatial_ref_sys", "!geography_columns",
#              "!geometry_columns" in drizzle.config.ts (Task #2778)
#              → difesa esplicita parallela a extensionsFilters per 0.31.x
#   Livello 3: questo script (db-push-safe.sh)
#              → pre-flight check su migration files + benign skip runtime
#
# Comportamento di questo wrapper (post-Task #2778):
# 1. Pre-flight: scansiona migrations/*.sql per statement PostGIS eseguibili.
#    Se trovati, esce con errore PRIMA di toccare il database.
# 2. Esegue `drizzle-kit push --force` catturando stdout+stderr.
# 3. Se esce 0 → success.
# 4. Se drizzle-kit fallisce e l'output contiene riferimenti a oggetti PostGIS:
#    a) Se l'output contiene SOLO errori PostGIS → warning benigno + exit 0
#       (questi errori sono attesi quando extensionsFilters non funziona in
#       0.31.x; tablesFilter è il fallback ma non copre i runtime errors).
#    b) Se l'output contiene sia errori PostGIS SIA altri errori → fail-fast
#       (non mascherare bug reali che coesistono con l'errore PostGIS).
# 5. Qualsiasi altro errore (nessun riferimento PostGIS) → fail-fast.

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

# ─── BENIGN SKIP per errori PostGIS (Task #2778) ────────────────────────────
# extensionsFilters non è affidabile al 100% in drizzle-kit 0.31.x.
# Se l'output contiene riferimenti a oggetti PostGIS, distinguiamo due casi:
#   a) SOLO errori PostGIS → warning benigno + exit 0 (skip sicuro)
#   b) Errori PostGIS + altri errori → fail-fast (non mascherare bug reali)
#
# Nota: Task #2762 aveva introdotto uno strict-fail per tutti i casi PostGIS,
# ma questo bloccava il deploy anche quando extensionsFilters semplicemente
# non funzionava in 0.31.x (regressione nota). Il comportamento benigno
# originale di Task #2700 viene ripristinato con il discriminatore aggiuntivo
# "altri errori presenti?".
if grep -qEi "$POSTGIS_OBJECTS_PATTERN" "$tmp_out"; then
  # Rimuove l'intero blocco di 3 righe dell'errore PostGIS usando perl.
  # drizzle-kit emette errori nel formato:
  #   Failed to run database migration statement     ← riga 1: nessun nome PostGIS
  #   ALTER TABLE "spatial_ref_sys" ADD PRIMARY KEY; ← riga 2: contiene nome PostGIS
  #   must be owner of table spatial_ref_sys         ← riga 3: conseguenza PostGIS
  # grep -v rimuoveva solo righe 2 e 3, lasciando riga 1 "Failed..." che
  # scattava erroneamente il fail-fast. perl rimuove l'intero blocco.
  stripped=$(perl -0777 -pe \
    's/[^\n]*\n[^\n]*(spatial_ref_sys|geography_columns|geometry_columns)[^\n]*\n[^\n]*(\n|$)//gi' \
    "$tmp_out" 2>/dev/null || grep -vEi "$POSTGIS_OBJECTS_PATTERN" "$tmp_out" || true)
  if echo "$stripped" | grep -qEi "error|Error|ERROR|failed|exception"; then
    echo "[db-push-safe] ERRORE: drizzle-kit ha fallito con errori PostGIS E altri errori non-PostGIS." >&2
    echo "Gli errori non-PostGIS indicano un problema reale che non può essere ignorato." >&2
    echo "Output non-PostGIS rilevante:" >&2
    echo "$stripped" | grep -Ei "error|Error|ERROR|failed|exception" >&2
    rm -f "$tmp_out"
    exit "$rc"
  fi
  # Solo errori PostGIS: skip benigno.
  echo "[db-push-safe] WARNING: drizzle-kit ha prodotto errori su oggetti PostGIS di sistema." >&2
  echo "Questo accade quando extensionsFilters non filtra correttamente in drizzle-kit 0.31.x." >&2
  echo "Gli oggetti spatial_ref_sys/geography_columns/geometry_columns sono di proprietà del" >&2
  echo "ruolo 'postgres' e NON devono essere modificati dall'utente applicativo." >&2
  echo "Skip benigno: il deploy continua. I livelli 1+2 (extensionsFilters + tablesFilter)" >&2
  echo "impediscono che questi oggetti vengano modificati nel database." >&2
  rm -f "$tmp_out"
  exit 0
fi

# ─── Qualsiasi altro errore: fail-fast ──────────────────────────────────────
echo "[db-push-safe] ERRORE drizzle-kit (exit $rc) — aborting." >&2
rm -f "$tmp_out"
exit "$rc"
