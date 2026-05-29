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
  # ─── RILEVAZIONE ROBUSTA basata sul CONTEGGIO ──────────────────────────────
  # BUG FIX (2026-05-29, v2): la versione precedente faceva lo strip del blocco
  # PostGIS con perl e poi un grep GENERICO "error|failed|exception" sul resto.
  # Con l'output reale di drizzle-kit in produzione (più ricco del test sintetico)
  # quel grep scattava su righe innocue (es. testo dello statement, summary,
  # spinner) → fail-fast erroneo → BUILD FALLITO. Sostituito con un conteggio
  # esatto: il deploy prosegue SOLO se OGNI fallimento riportato da drizzle-kit
  # riguarda un oggetto PostGIS di sistema.
  #
  # drizzle-kit, quando uno statement fallisce, stampa il marker
  #   "Failed to run database migration statement"
  # seguito (nelle ~2 righe successive) dallo statement SQL e dal messaggio
  # Postgres "must be owner of ...".
  #
  # STRATEGIA (residuo + anchor): un awk a stati RIMUOVE dall'output i blocchi
  # interamente PostGIS (marker + max 2 righe che contengono un oggetto PostGIS)
  # e le righe isolate "must be owner of <PostGIS>". Ciò che resta è il "residuo".
  # Se nel residuo compare QUALSIASI anchor di errore ad alto segnale → fail-fast
  # (errore reale, anche se fuori dai blocchi PostGIS, es. timeout di rete).
  # Solo se il residuo è pulito lo skip è benigno.
  #
  # Perché non un grep generico (come la versione precedente)? "error|failed"
  # scattava sulle righe stesse del blocco PostGIS e su testo innocuo → fail-fast
  # erroneo → BUILD FALLITO. Qui prima si rimuovono i blocchi benigni, poi si
  # cercano SOLO anchor specifici sul residuo.
  residual=$(awk '
    function emit() { if (binblock) { if (!bhaspg) for (i=0;i<bn;i++) print bbuf[i]; binblock=0; bn=0; bhaspg=0 } }
    /Failed to run database migration statement/ { emit(); binblock=1; bn=0; bhaspg=0; bbuf[bn++]=$0; bcnt=0; next }
    binblock {
      bbuf[bn++]=$0
      if (tolower($0) ~ /spatial_ref_sys|geography_columns|geometry_columns/) bhaspg=1
      bcnt++; if (bcnt>=2) emit()
      next
    }
    {
      if (tolower($0) ~ /must be owner of/ && tolower($0) ~ /spatial_ref_sys|geography_columns|geometry_columns/) next
      print
    }
    END { emit() }
  ' "$tmp_out")

  # Anchor di errore ad alto segnale cercati SOLO sul residuo (post-rimozione
  # dei blocchi PostGIS benigni). Tutto ciò che resta e fa match è un bug reale.
  ERROR_ANCHORS='Failed to run database migration statement|must be owner of|(^|[[:space:]])(Error|error|ERROR):|DrizzleQueryError|Postgres(Query)?Error|PgError|syntax error|does not exist|permission denied|violates|could not|cannot |ECONNREFUSED|ETIMEDOUT|getaddrinfo|timeout'

  if echo "$residual" | grep -qEi "$ERROR_ANCHORS"; then
    echo "[db-push-safe] ERRORE: drizzle-kit ha fallito con errori NON riconducibili solo a PostGIS." >&2
    echo "Righe di errore residue (fuori dai blocchi PostGIS benigni):" >&2
    echo "$residual" | grep -Ei "$ERROR_ANCHORS" >&2
    echo "Fail-fast per non mascherare bug reali." >&2
    rm -f "$tmp_out"
    exit "$rc"
  fi

  # Residuo pulito: tutti gli errori erano su oggetti PostGIS di sistema → benigno.
  echo "[db-push-safe] WARNING: drizzle-kit ha fallito SOLO su oggetti PostGIS di sistema." >&2
  echo "Gli oggetti spatial_ref_sys/geography_columns/geometry_columns sono di proprietà del ruolo" >&2
  echo "'postgres' e NON vengono modificati. Skip benigno: il deploy continua (livelli 1+2 attivi)." >&2
  rm -f "$tmp_out"
  exit 0
fi

# ─── Qualsiasi altro errore: fail-fast ──────────────────────────────────────
echo "[db-push-safe] ERRORE drizzle-kit (exit $rc) — aborting." >&2
rm -f "$tmp_out"
exit "$rc"
