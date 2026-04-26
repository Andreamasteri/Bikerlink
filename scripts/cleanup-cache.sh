#!/bin/bash
# cleanup-cache.sh — Pulizia periodica cache workspace Replit
# Svuota le cache di sviluppo (TypeScript, Metro, node_modules, tmp/logs)
# preservando le directory protette da Replit (.cache/replit/).
# Log con rotazione (ultimi 7 run) in logs/cleanup-cache.log
# Exit code 0 anche se una cartella non esiste.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/logs/cleanup-cache.log"
LOG_ROTATION_KEEP=7
SEPARATOR="---RUN---"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ── Assicura che la dir dei log esista ───────────────────────────────────────
mkdir -p "$PROJECT_ROOT/logs"

# ── Guardia anti-build ───────────────────────────────────────────────────────
# Salta se sono in corso processi EAS, Gradle, o build-apk.sh
# Pattern con [b] evita che pgrep trovi se stesso nella lista processi
if pgrep -f "[b]uild-apk\.sh|[e]as build|[g]radlew|[c]om\.android\.build" > /dev/null 2>&1; then
  {
    echo "$SEPARATOR"
    echo "[$TIMESTAMP] SKIP — build APK in corso (EAS/Gradle rilevato). Cache NON pulita."
  } >> "$LOG_FILE"
  echo "[CLEANUP] SKIP — build in corso, cache non toccata."
  exit 0
fi

# ── Misura dimensioni di una directory ───────────────────────────────────────
size_of() {
  local dir="$1"
  if [ -d "$dir" ]; then
    du -sh "$dir" 2>/dev/null | awk '{print $1}'
  else
    echo "0"
  fi
}

# ── Svuota una directory preservando la directory stessa ────────────────────
# $1 = path, $2 = modalità: "all" (tutto), "safe" (escludi 'replit/')
empty_dir() {
  local dir="$1"
  local mode="${2:-all}"
  if [ ! -d "$dir" ]; then
    echo "SKIP"
    return
  fi
  if [ "$mode" = "safe" ]; then
    # Elimina tutto tranne la sottodirectory 'replit' (protetta da Replit)
    find "$dir" -mindepth 1 -maxdepth 1 ! -name 'replit' -exec rm -rf {} + 2>/dev/null || true
  else
    find "$dir" -mindepth 1 -delete 2>/dev/null || true
  fi
  echo "OK"
}

# ── Misura MB prima ───────────────────────────────────────────────────────────
BEFORE_CACHE=$(size_of "$PROJECT_ROOT/.cache")
BEFORE_METRO=$(size_of "$PROJECT_ROOT/.metro-cache")
BEFORE_NM=$(size_of "$PROJECT_ROOT/node_modules/.cache")
BEFORE_TMP=$(size_of "/tmp/logs")

# ── Pulizia ───────────────────────────────────────────────────────────────────
# .cache/ — escludi .cache/replit/ che è protetto da Replit
STATUS_CACHE=$(empty_dir "$PROJECT_ROOT/.cache" "safe")
STATUS_METRO=$(empty_dir "$PROJECT_ROOT/.metro-cache" "all")
STATUS_NM=$(empty_dir "$PROJECT_ROOT/node_modules/.cache" "all")
STATUS_TMP=$(empty_dir "/tmp/logs" "all")

# ── Misura MB dopo ────────────────────────────────────────────────────────────
AFTER_CACHE=$(size_of "$PROJECT_ROOT/.cache")
AFTER_METRO=$(size_of "$PROJECT_ROOT/.metro-cache")
AFTER_NM=$(size_of "$PROJECT_ROOT/node_modules/.cache")
AFTER_TMP=$(size_of "/tmp/logs")

# ── Calcola MB liberati totali ───────────────────────────────────────────────
# Converte "719M"→719, "200M"→200, "192K"→0.1, "0"→0 in MB (interi)
to_mb() {
  local v="$1"
  case "$v" in
    *G) echo "${v%G}" | awk '{printf "%d", $1 * 1024}' ;;
    *M) echo "${v%M}" | awk '{printf "%d", $1}' ;;
    *K) echo "0" ;;
    *) echo "0" ;;
  esac
}
MB_BEFORE=$(( $(to_mb "$BEFORE_CACHE") + $(to_mb "$BEFORE_METRO") + $(to_mb "$BEFORE_NM") + $(to_mb "$BEFORE_TMP") ))
MB_AFTER=$(( $(to_mb "$AFTER_CACHE") + $(to_mb "$AFTER_METRO") + $(to_mb "$AFTER_NM") + $(to_mb "$AFTER_TMP") ))
MB_FREED=$(( MB_BEFORE - MB_AFTER ))

# ── Scrivi record nel log ─────────────────────────────────────────────────────
{
  echo "$SEPARATOR"
  echo "[$TIMESTAMP] Pulizia cache completata — liberati circa ${MB_FREED}MB"
  echo "  .cache/             $BEFORE_CACHE → $AFTER_CACHE  ($STATUS_CACHE)"
  echo "  .metro-cache/       $BEFORE_METRO → $AFTER_METRO  ($STATUS_METRO)"
  echo "  node_modules/.cache $BEFORE_NM → $AFTER_NM  ($STATUS_NM)"
  echo "  /tmp/logs/          $BEFORE_TMP → $AFTER_TMP  ($STATUS_TMP)"
} >> "$LOG_FILE"

# ── Rotazione log: mantieni solo gli ultimi N run ────────────────────────────
if [ -f "$LOG_FILE" ]; then
  RUN_COUNT=$(grep -c "^$SEPARATOR" "$LOG_FILE" 2>/dev/null || echo "0")
  if [ "$RUN_COUNT" -gt "$LOG_ROTATION_KEEP" ]; then
    EXCESS=$(( RUN_COUNT - LOG_ROTATION_KEEP ))
    # Riga del separatore da cui tenere (il (EXCESS+1)-esimo separatore)
    KEEP_LINE=$(grep -n "^$SEPARATOR" "$LOG_FILE" | awk -F: "NR==$((EXCESS + 1)){print \$1}")
    if [ -n "$KEEP_LINE" ] && [ "$KEEP_LINE" -gt 1 ]; then
      tail -n "+$KEEP_LINE" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
  fi
fi

# ── Output sommario su stdout ─────────────────────────────────────────────────
echo "[CLEANUP] Liberati ~${MB_FREED}MB: .cache $BEFORE_CACHE→$AFTER_CACHE | .metro-cache $BEFORE_METRO→$AFTER_METRO | node_modules/.cache $BEFORE_NM→$AFTER_NM | /tmp/logs $BEFORE_TMP→$AFTER_TMP"
