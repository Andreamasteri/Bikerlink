#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Gate pre-deploy: verifica versioni stabili dipendenze critiche
#
#  Legge package.json, interroga il registry npm per ogni pacchetto nella
#  lista CRITICAL_PACKAGES e avvisa se esiste una versione major o minor
#  più recente di quella installata.
#
#  NON BLOCCA il deploy (exit sempre 0) — emette solo WARNING visibili nei
#  log di build/post-merge come promemoria per il prossimo aggiornamento.
#
#  Lista CRITICAL_PACKAGES: configurabile nella sezione sotto.
#  Pacchetti con eccezioni hardcoded (keyboard-controller, react-native-maps,
#  expo-crypto) sono già documentati nella skill latest-stable-versions e
#  vengono annotati nell'output ma NON contati come warning azionabili.
#
#  Uso:
#    bash scripts/check-stable-versions.sh
#
#  Exit code: sempre 0 (non-bloccante).
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Lista pacchetti critici da controllare ───────────────────────────────────
# Formato: "nome-pacchetto" (uno per riga).
# Per escludere un pacchetto dal warning aggiungere il nome in PINNED_PACKAGES.
CRITICAL_PACKAGES=(
  "expo"
  "react-native"
  "@tanstack/react-query"
  "express"
  "drizzle-orm"
  "typescript"
  "vite"
  "vitest"
  "@ai-sdk/google"
  "@ai-sdk/openai"
  "@ai-sdk/groq"
  "react"
  "ioredis"
  "pg"
  "nodemailer"
)

# Pacchetti con versione fissa (eccezioni hardcoded) — segnalati come INFO,
# non come warning, perché l'aggiornamento è volutamente bloccato.
PINNED_PACKAGES=(
  "react-native-keyboard-controller"
  "react-native-maps"
  "expo-crypto"
)

# ── Helpers ──────────────────────────────────────────────────────────────────
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

warn()  { echo -e "  ${YELLOW}⚠ WARNING${RESET}  $*"; }
ok()    { echo -e "  ${GREEN}✔${RESET}  $*"; }
info()  { echo -e "  ${CYAN}ℹ${RESET}  $*"; }
skip()  { echo -e "  ${CYAN}⊘${RESET}  $*"; }

WARNINGS=0
ERRORS=0
CHECKED=0

# ── Funzione di confronto semver (major/minor) ───────────────────────────────
# Ritorna:
#   0  → aggiornato (nessuna major/minor disponibile)
#   1  → MAJOR outdated
#   2  → MINOR outdated
semver_check() {
  local installed="$1"
  local latest="$2"
  node -e "
    function parse(v) {
      const m = v.replace(/^[^0-9]*/, '').match(/^(\d+)\.(\d+)\.?(\d*)/);
      if (!m) return [0,0,0];
      return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3]||'0',10)];
    }
    const inst = parse('$installed');
    const lat  = parse('$latest');
    if (lat[0] > inst[0]) { process.exit(1); }
    if (lat[0] === inst[0] && lat[1] > inst[1]) { process.exit(2); }
    process.exit(0);
  " 2>/dev/null
}

# ── Estrai versione da package.json (strip range specifiers) ─────────────────
get_installed_version() {
  local pkg="$1"
  # Prova prima in dependencies, poi devDependencies
  node -e "
    try {
      const p = require('./package.json');
      const v = (p.dependencies || {})['$pkg'] || (p.devDependencies || {})['$pkg'] || '';
      // Rimuove prefissi di range (^, ~, >, =, spazi, "latest")
      const clean = v.replace(/^[^0-9]*/, '').trim();
      process.stdout.write(clean || '');
    } catch(e) { process.stdout.write(''); }
  " 2>/dev/null
}

# ── Recupera versione latest dal registry npm ─────────────────────────────────
get_latest_version() {
  local pkg="$1"
  # Timeout 8s per non bloccare il deploy se il registry è lento
  local result
  result=$(curl -sf --max-time 8 "https://registry.npmjs.org/${pkg}/latest" 2>/dev/null \
    | node -e "
        let d='';
        process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          try { process.stdout.write(JSON.parse(d).version||''); }
          catch(e){ process.stdout.write(''); }
        });
      " 2>/dev/null) || true
  echo "$result"
}

# ── Intestazione ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   BikerLink — Verifica versioni stabili (non-bloccante)     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo "  Interrogo il registry npm per ${#CRITICAL_PACKAGES[@]} dipendenze critiche..."
echo "  (timeout 8s per pacchetto — errori di rete ignorati)"
echo ""

# ── Loop principale ───────────────────────────────────────────────────────────
for PKG in "${CRITICAL_PACKAGES[@]}"; do
  INSTALLED=$(get_installed_version "$PKG")

  if [ -z "$INSTALLED" ]; then
    skip "$PKG — non trovato in package.json, skip"
    continue
  fi

  LATEST=$(get_latest_version "$PKG")

  if [ -z "$LATEST" ]; then
    skip "$PKG@${INSTALLED} — registry non raggiungibile (rete/timeout), skip"
    ((ERRORS++)) || true
    continue
  fi

  ((CHECKED++)) || true

  # Confronto semver
  SEMVER_EXIT=0
  semver_check "$INSTALLED" "$LATEST" || SEMVER_EXIT=$?

  case "$SEMVER_EXIT" in
    0)
      ok "$PKG  installato=${INSTALLED}  latest=${LATEST}  ✓ aggiornato"
      ;;
    1)
      warn "$PKG  installato=${INSTALLED}  latest=${LATEST}  → MAJOR update disponibile"
      ((WARNINGS++)) || true
      ;;
    2)
      warn "$PKG  installato=${INSTALLED}  latest=${LATEST}  → minor update disponibile"
      ((WARNINGS++)) || true
      ;;
    *)
      skip "$PKG  installato=${INSTALLED}  latest=${LATEST}  — confronto semver fallito, skip"
      ;;
  esac
done

# ── Pacchetti pinned (solo informativo) ──────────────────────────────────────
if [ ${#PINNED_PACKAGES[@]} -gt 0 ]; then
  echo ""
  echo "  Pacchetti con versione fissa (eccezioni hardcoded — NON aggiornare senza ok):"
  for PKG in "${PINNED_PACKAGES[@]}"; do
    INSTALLED=$(get_installed_version "$PKG")
    if [ -n "$INSTALLED" ]; then
      info "$PKG@${INSTALLED} — PINNED (vedi skill latest-stable-versions)"
    fi
  done
fi

# ── Sommario finale ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo "  Riepilogo verifica versioni stabili:"
echo "    Pacchetti controllati : ${CHECKED}"
echo "    Warning outdated      : ${WARNINGS}"
echo "    Errori rete/registry  : ${ERRORS}"
echo ""

if [ "$WARNINGS" -gt 0 ]; then
  echo -e "  ${YELLOW}${BOLD}⚠  ${WARNINGS} pacchett$([ "$WARNINGS" -eq 1 ] && echo 'o' || echo 'i') con aggiornamenti disponibili.${RESET}"
  echo "     Eseguire il protocollo 4 fasi (skill latest-stable-versions) prima"
  echo "     del prossimo aggiornamento. Il deploy NON è bloccato."
else
  echo -e "  ${GREEN}${BOLD}✔  Tutte le dipendenze critiche risultano aggiornate.${RESET}"
fi

echo -e "${BOLD}══════════════════════════════════════════════════════════════${RESET}"
echo ""

# Exit 0 sempre — questo gate è non-bloccante.
exit 0
