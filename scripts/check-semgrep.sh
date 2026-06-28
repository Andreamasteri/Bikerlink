#!/usr/bin/env bash
# check-semgrep.sh
#
# Gate di sicurezza statico basato su Semgrep, in stile CI ricorrente come gli
# altri gate del repo (check-mutation-object-deps.sh, check-rnav-inline-props.sh,
# lint-migration-indexes, ecc.).
#
# Cosa fa:
#   - Esegue Semgrep con una configurazione VERSIONATA e SENZA account/servizio
#     esterno a pagamento:
#       1. Regole locali del progetto:  .semgrep/bikerlink.yml
#       2. Ruleset "open" del registry pubblico (scaricati anonimamente, NESSUN
#          login): p/javascript p/typescript p/nodejs p/expressjs p/react
#          p/owasp-top-ten p/secrets
#   - Confronta i finding con una BASELINE congelata (.semgrep-baseline).
#   - FALLISCE solo su finding NUOVI di severità ERROR o HIGH. I finding
#     ERROR/HIGH già presenti restano congelati; i WARNING sono tracciati ma NON
#     bloccano (notice informativo).
#
# ── PERCHÉ env -u PYTHONPATH ─────────────────────────────────────────────────
# Il workspace espone `.pythonlibs` (py3.11/pydantic) via PYTHONPATH; questo
# inquina l'ambiente py3.13 del binario semgrep e lo fa crashare. Lo lanciamo
# quindi sempre con PYTHONPATH ripulito. `--metrics off` evita ogni telemetria.
#
# ── BASELINE / RATCHET ───────────────────────────────────────────────────────
# La baseline (.semgrep-baseline) congela i finding pre-esistenti. La chiave di
# ogni finding è  <severità>\t<check_id>\t<path>\t<fingerprint>.
# NB: Semgrep ANONIMO (senza login) REDIGE extra.fingerprint ed extra.lines a
# "requires login", quindi NON sono utilizzabili. Calcoliamo perciò un
# fingerprint di contenuto nostro: sha1(check_id|snippet-normalizzato)[:12], dove
# lo snippet è letto da disco (start.line..end.line, righe strip+join), più un
# indice di occorrenza per i duplicati. È quindi basato sul CONTENUTO (resistente
# allo spostamento di righe e all'aggiunta di commenti sopra il match), non sul
# fingerprint di Semgrep. Il gate FALLISCE solo su NUOVE chiavi ERROR/HIGH non
# elencate in baseline. Le voci legacy possono solo diminuire.
#
# Aggiornare la baseline è un'azione UMANA esplicita:
#   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-semgrep.sh --update-baseline
#
# ── SOPPRESSIONE INLINE (falsi positivi verificati) ──────────────────────────
# Si usa la soppressione NATIVA di Semgrep: aggiungere sulla riga incriminata
# (o sulla precedente) il commento:
#     // nosemgrep: <rule-id>     (sopprime solo quella regola — preferito)
#     // nosemgrep                (sopprime tutte le regole sulla riga)
# Documentare sempre il motivo accanto al commento.
#
# ── DEGRADO DI RETE ──────────────────────────────────────────────────────────
# Se il registry pubblico non è raggiungibile (offline/CI isolata), il gate
# NON si rompe: esegue solo le regole locali e stampa un avviso. I finding dei
# pack del registry, quando torneranno, sono già in baseline → non bloccano.

set -euo pipefail

LOCAL_CONFIG=".semgrep/bikerlink.yml"
BASELINE_FILE=".semgrep-baseline"
SCAN_PATHS=(server shared app components hooks lib constants config)
REGISTRY_PACKS=(p/javascript p/typescript p/nodejs p/expressjs p/react p/owasp-top-ten p/secrets)

UPDATE_BASELINE=0
for arg in "$@"; do
  if [[ "$arg" == "--update-baseline" ]]; then
    UPDATE_BASELINE=1
  fi
done

if [ "$UPDATE_BASELINE" -eq 1 ] && [ "${BIKERLINK_HUMAN_BASELINE_UPDATE:-}" != "1" ]; then
  echo "❌ Solo l'utente può aggiornare la baseline. Esegui:"
  echo "   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-semgrep.sh --update-baseline"
  exit 1
fi

# ── Binario semgrep presente? Se assente, degrada (non blocca il post-merge) ──
# Default: degrado morbido (exit 0) per non rompere il merge su ambienti senza
# semgrep. Con SEMGREP_STRICT=1 (es. CI dedicata) l'assenza del binario è invece
# un errore bloccante, così il gate non viene silenziosamente saltato.
if ! command -v semgrep >/dev/null 2>&1; then
  if [ "${SEMGREP_STRICT:-0}" = "1" ]; then
    echo "❌ semgrep non trovato nel PATH e SEMGREP_STRICT=1 — gate FALLITO."
    echo "    Installa semgrep oppure rimuovi SEMGREP_STRICT per il degrado morbido."
    exit 1
  fi
  echo "⚠️  semgrep non trovato nel PATH — gate di sicurezza SALTATO (non bloccante)."
  echo "    Installa semgrep per riattivare il controllo (o usa SEMGREP_STRICT=1 in CI)."
  exit 0
fi

if [ ! -f "$LOCAL_CONFIG" ]; then
  echo "❌ Configurazione locale mancante: $LOCAL_CONFIG"
  exit 1
fi

# ── Costruzione degli argomenti --config ─────────────────────────────────────
CONFIG_ARGS=(--config "$LOCAL_CONFIG")
REGISTRY_OK=0
if curl -s -o /dev/null --max-time 12 "https://semgrep.dev/c/p/javascript"; then
  REGISTRY_OK=1
  for p in "${REGISTRY_PACKS[@]}"; do
    CONFIG_ARGS+=(--config "$p")
  done
else
  echo "⚠️  Registry Semgrep non raggiungibile — eseguo solo le regole locali ($LOCAL_CONFIG)."
fi

echo "🔍 Semgrep in esecuzione (config locale$([ "$REGISTRY_OK" -eq 1 ] && echo " + ${#REGISTRY_PACKS[@]} ruleset open"))..."

# ── Esecuzione (PYTHONPATH ripulito, niente telemetria) ──────────────────────
TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

SEMGREP_EXIT=0
env -u PYTHONPATH semgrep "${CONFIG_ARGS[@]}" \
  --metrics off --quiet --json \
  "${SCAN_PATHS[@]}" > "$TMP_JSON" 2>/dev/null || SEMGREP_EXIT=$?

# Exit code 1 = finding trovati (atteso); >1 = errore reale di esecuzione.
if [ "$SEMGREP_EXIT" -gt 1 ]; then
  echo "❌ Semgrep ha riportato un errore di esecuzione (exit $SEMGREP_EXIT)."
  echo "   Suggerimento: verifica la connettività al registry o esegui:"
  echo "   env -u PYTHONPATH semgrep --config $LOCAL_CONFIG --metrics off ${SCAN_PATHS[*]}"
  exit "$SEMGREP_EXIT"
fi

# ── Estrazione dei finding (TSV: key \t :: \t display) ───────────────────────
# key = severità\tcheck_id\tpath\t<fingerprint-di-contenuto>
#
# NOTA: il binario Semgrep anonimo (senza login) REDIGE i campi extra.fingerprint
# ed extra.lines a "requires login", quindi NON sono usabili come chiave. Ci
# calcoliamo un fingerprint di CONTENUTO leggendo lo snippet dal file su disco
# (range start.line..end.line). È stabile allo spostamento di righe (dipende dal
# testo, non dalla posizione) e distingue finding diversi nello stesso file; un
# indice di occorrenza disambigua snippet identici ripetuti.
RESULT=$(python3 - "$TMP_JSON" << 'PYEOF'
import json
import sys
import hashlib

with open(sys.argv[1], "r", encoding="utf-8", errors="ignore") as f:
    data = json.load(f)

_file_cache = {}


def file_lines(path):
    if path not in _file_cache:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                _file_cache[path] = fh.read().split("\n")
        except OSError:
            _file_cache[path] = None
    return _file_cache[path]


def snippet_hash(cid, path, sline, eline, scol, ecol):
    lines = file_lines(path)
    if lines and 1 <= sline <= len(lines):
        chunk = lines[sline - 1: max(eline, sline)]
        norm = " ".join(seg.strip() for seg in chunk if seg.strip())
    else:
        # Fallback se il file non è leggibile: usa la posizione.
        norm = f"@{sline}:{scol}-{eline}:{ecol}"
    h = hashlib.sha1((cid + "|" + norm).encode("utf-8", "ignore")).hexdigest()
    return h[:12]


occ = {}
for r in data.get("results", []):
    extra = r.get("extra", {})
    sev = extra.get("severity", "INFO")
    cid = r.get("check_id", "?")
    short = cid.split(".")[-1]
    path = r.get("path", "?")
    start = r.get("start", {})
    end = r.get("end", {})
    sline = start.get("line", 0)
    scol = start.get("col", 0)
    eline = end.get("line", sline)
    ecol = end.get("col", 0)
    msg = (extra.get("message", "") or "").replace("\n", " ").strip()[:160]
    fp = snippet_hash(cid, path, sline, eline, scol, ecol)
    base = (sev, cid, path, fp)
    idx = occ.get(base, 0)
    occ[base] = idx + 1
    fp_key = fp if idx == 0 else f"{fp}#{idx}"
    key = f"{sev}\t{cid}\t{path}\t{fp_key}"
    print(f"{key}\t::\t{path}:{sline}\t[{short}]\t{msg}")
PYEOF
)

# ── Modalità --update-baseline (umana) ───────────────────────────────────────
if [ "$UPDATE_BASELINE" -eq 1 ]; then
  if [ "$REGISTRY_OK" -ne 1 ]; then
    echo "❌ Registry non raggiungibile: non aggiorno la baseline con i soli rule locali"
    echo "   (rischierei di congelare un set parziale). Riprova online."
    exit 1
  fi
  {
    echo "# .semgrep-baseline"
    echo "# Finding Semgrep pre-esistenti congelati. Il gate"
    echo "# (scripts/check-semgrep.sh) FALLISCE solo su NUOVI finding ERROR non"
    echo "# elencati qui. I WARNING sono tracciati ma non bloccanti."
    echo "# Formato (un record per riga):  <severità>\\t<check_id>\\t<path>\\t<fingerprint>"
    echo "# Aggiornare SOLO via:"
    echo "#   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-semgrep.sh --update-baseline"
    if [ -n "$RESULT" ]; then
      echo "$RESULT" | awk -F'\t::\t' '{print $1}' | sort -u
    fi
  } > "$BASELINE_FILE"
  TOTAL=$(echo "$RESULT" | grep -c . || true)
  ERRC=$(echo "$RESULT" | grep -c '^ERROR' || true)
  echo "✅ Baseline aggiornata: $BASELINE_FILE ($TOTAL finding congelati, di cui $ERRC ERROR)."
  exit 0
fi

# ── Carica baseline ──────────────────────────────────────────────────────────
BASELINE_KEYS=""
if [ -f "$BASELINE_FILE" ]; then
  BASELINE_KEYS=$(grep -vE '^\s*#' "$BASELINE_FILE" 2>/dev/null | grep -vE '^\s*$' | sort -u || true)
fi

# Chiavi correnti (la parte prima di "\t::\t").
CURRENT_KEYS=""
if [ -n "$RESULT" ]; then
  CURRENT_KEYS=$(echo "$RESULT" | awk -F'\t::\t' '{print $1}' | sort -u)
fi

# Nuove = correnti ∉ baseline.  Stale = baseline ∉ correnti.
NEW_KEYS=$(comm -23 <(echo "$CURRENT_KEYS") <(echo "$BASELINE_KEYS") 2>/dev/null || true)
STALE_KEYS=$(comm -13 <(echo "$CURRENT_KEYS") <(echo "$BASELINE_KEYS") 2>/dev/null || true)

# Avviso non-bloccante: voci di baseline ora risolte (solo se registry attivo,
# altrimenti i pack mancanti generano "stale" fuorvianti).
STALE_TRIM=$(echo "$STALE_KEYS" | grep -vE '^\s*$' || true)
if [ -n "$STALE_TRIM" ] && [ "$REGISTRY_OK" -eq 1 ]; then
  RESOLVED=$(echo "$STALE_TRIM" | wc -l | tr -d ' ')
  echo ""
  echo "ℹ️  $RESOLVED voce/i di baseline non più presenti (risolte) — la baseline può restringersi:"
  echo "$STALE_TRIM" | awk -F'\t' '{print "   ✔ ["$1"] "$3}' | head -20
  echo "   Aggiorna con: BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-semgrep.sh --update-baseline"
fi

# Separa i nuovi finding per severità.
NEW_TRIM=$(echo "$NEW_KEYS" | grep -vE '^\s*$' || true)
# Bloccanti = ERROR + HIGH (difensivo: alcuni pack del registry possono emettere
# la severità come "HIGH" invece di "ERROR"). Tutto il resto è non-bloccante.
NEW_ERRORS=$(echo "$NEW_TRIM" | grep -E '^(ERROR|HIGH)' || true)
NEW_WARNINGS=$(echo "$NEW_TRIM" | grep -vE '^(ERROR|HIGH)' || true)

# Notice non-bloccante per nuovi WARNING.
NEW_WARN_TRIM=$(echo "$NEW_WARNINGS" | grep -vE '^\s*$' || true)
if [ -n "$NEW_WARN_TRIM" ]; then
  WC=$(echo "$NEW_WARN_TRIM" | wc -l | tr -d ' ')
  echo ""
  echo "ℹ️  $WC nuovo/i finding WARNING (non bloccanti — valuta se vanno corretti o soppressi):"
  while IFS= read -r k; do
    [ -z "$k" ] && continue
    echo "$RESULT" | awk -F'\t::\t' -v key="$k" '$1==key {print "   • "$2; exit}'
  done <<< "$NEW_WARN_TRIM" | head -20
fi

# ── Esito: bloccano solo i NUOVI finding ERROR ───────────────────────────────
NEW_ERR_TRIM=$(echo "$NEW_ERRORS" | grep -vE '^\s*$' || true)
if [ -z "$NEW_ERR_TRIM" ]; then
  echo ""
  echo "✅ Nessun NUOVO finding Semgrep di severità ERROR/HIGH (baseline rispettata)."
  exit 0
fi

echo ""
while IFS= read -r k; do
  [ -z "$k" ] && continue
  MATCH=$(echo "$RESULT" | awk -F'\t::\t' -v key="$k" '$1==key {print $2; exit}')
  echo "❌ NUOVO ERROR/HIGH — ${MATCH:-$k}"
done <<< "$NEW_ERR_TRIM"

echo ""
echo "💥 check-semgrep FALLITO"
echo ""
echo "   Sono stati introdotti nuovi finding di sicurezza di severità ERROR/HIGH"
echo "   non presenti nella baseline ($BASELINE_FILE)."
echo ""
echo "   Opzioni:"
echo "     1. Correggi il problema segnalato (consigliato)."
echo "     2. Se è un falso positivo verificato, sopprimilo inline con la"
echo "        soppressione nativa di Semgrep sulla riga incriminata:"
echo "          // nosemgrep: <rule-id>   — <motivo>"
echo "     3. Se è un debito tecnico accettato consapevolmente, l'utente può"
echo "        ricongelarlo nella baseline:"
echo "          BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-semgrep.sh --update-baseline"
echo ""
echo "   Config: $LOCAL_CONFIG + ruleset open del registry pubblico (no account)."
echo ""
exit 1
