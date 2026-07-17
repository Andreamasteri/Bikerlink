#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Bowie Terminal Package Drift Check
#
#  Verifica che bowie-terminal/package-lock.json non sia rimasto indietro
#  rispetto ai pacchetti Expo SDK risolti dal package-lock.json della root.
#
#  Confronta SOLO i pacchetti per cui la versione della root ricade ancora
#  nel range dichiarato in bowie-terminal/package.json (es. ~56.0.x).
#  I pacchetti con pin esatto o range diverso vengono ignorati.
#
#  Uso:
#    bash scripts/check-bowie-pkg-drift.sh            # esce 1 se ci sono drift
#    bash scripts/check-bowie-pkg-drift.sh --warn-only # solo warning, esce 0
#
#  Integrato nel workflow "db-migration-checks" (--warn-only) e utilizzabile
#  come blocco prima di avviare una build Bowie Terminal.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

WARN_ONLY=false
[[ "${1:-}" == "--warn-only" ]] && WARN_ONLY=true

ROOT_LOCK="package-lock.json"
BOWIE_PKG="bowie-terminal/package.json"
BOWIE_LOCK="bowie-terminal/package-lock.json"

BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     BikerLink — Bowie Terminal Package Drift Check          ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Prerequisiti ────────────────────────────────────────────────────────────
for f in "$ROOT_LOCK" "$BOWIE_PKG" "$BOWIE_LOCK"; do
  if [ ! -f "$f" ]; then
    echo -e "  \033[0;31m✖\033[0m  File mancante: $f"
    exit 1
  fi
done

# ── Confronto versioni via Node ──────────────────────────────────────────────
# Usa il modulo semver già presente in node_modules (transitivo di npm)
DRIFT_TMP=$(mktemp)
trap 'rm -f "$DRIFT_TMP"' EXIT

node - "$DRIFT_TMP" <<'NODEJS'
const fs   = require('fs');
const path = require('path');
const out  = process.argv[2];

const rootLock  = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const bowiePkg  = JSON.parse(fs.readFileSync('bowie-terminal/package.json', 'utf8'));
const bowieLock = JSON.parse(fs.readFileSync('bowie-terminal/package-lock.json', 'utf8'));

const bowieDeclarations = {
  ...(bowiePkg.dependencies    || {}),
  ...(bowiePkg.devDependencies || {}),
};

// ── Inline semver helpers (no external semver dep needed) ──────────────────
function parseVer(v) {
  const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function semverLt(a, b) {
  const av = parseVer(a), bv = parseVer(b);
  if (!av || !bv) return false;
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return true;
    if (av[i] > bv[i]) return false;
  }
  return false;
}

// Check whether candidate version satisfies a range string.
// Supports: exact (1.2.3), tilde (~1.2.3 = >=1.2.3 <1.3.0),
//           caret (^1.2.3 = >=1.2.3 <2.0.0), any (*).
function satisfies(candidate, range) {
  const cv = parseVer(candidate);
  if (!cv) return false;
  const r = range.trim();
  if (r === '*' || r === '') return true;

  // Exact pin (no prefix)
  if (/^\d/.test(r)) {
    return candidate === r || r === candidate;
  }

  const tilde = r.startsWith('~');
  const caret = r.startsWith('^');
  const base  = parseVer(r.replace(/^[~^]/, ''));
  if (!base) return false;

  if (tilde) {
    // ~major.minor.patch → >=base <major.(minor+1).0
    if (cv[0] !== base[0] || cv[1] !== base[1]) return false;
    return !semverLt(cv.join('.'), base.join('.'));
  }
  if (caret) {
    // ^major.minor.patch → >=base <(major+1).0.0
    if (cv[0] !== base[0]) return false;
    return !semverLt(cv.join('.'), base.join('.'));
  }

  // >= / <= / > / < — basic support
  const gte = r.startsWith('>=');
  const lte = r.startsWith('<=');
  const gt  = r.startsWith('>') && !gte;
  const lt  = r.startsWith('<') && !lte;
  const bnd = parseVer(r.replace(/^[><=]+/, ''));
  if (!bnd) return false;
  const bndStr = bnd.join('.');
  if (gte) return !semverLt(candidate, bndStr);
  if (lte) return !semverLt(bndStr, candidate);
  if (gt)  return semverLt(bndStr, candidate);
  if (lt)  return semverLt(candidate, bndStr);
  return false;
}

// ── Compare ───────────────────────────────────────────────────────────────
const drifted = [];   // root newer AND satisfies bowie range → bowie should update
const ok      = [];   // bowie is up to date (same or newer than root within range)
const skipped = [];   // root not present, or root version outside bowie range

for (const [pkg, declaredRange] of Object.entries(bowieDeclarations)) {
  const bowieResolved = bowieLock.packages?.['node_modules/' + pkg]?.version;
  const rootResolved  = rootLock.packages?.['node_modules/' + pkg]?.version;

  if (!bowieResolved) continue;  // not in bowie lockfile at all — skip
  if (!rootResolved)  { skipped.push({ pkg, bowieVersion: bowieResolved, reason: 'non in root' }); continue; }

  // Only flag drift when the root's version actually fits the bowie declared range.
  // If root has 0.86.0 but bowie declares "0.85.3" (exact), that's not drift.
  if (!satisfies(rootResolved, declaredRange)) {
    skipped.push({ pkg, bowieVersion: bowieResolved, rootVersion: rootResolved,
                   reason: `root=${rootResolved} fuori dal range dichiarato "${declaredRange}"` });
    continue;
  }

  if (semverLt(bowieResolved, rootResolved)) {
    drifted.push({ pkg, bowieVersion: bowieResolved, rootVersion: rootResolved, declaredRange });
  } else {
    ok.push({ pkg, bowieVersion: bowieResolved, rootVersion: rootResolved });
  }
}

fs.writeFileSync(out, JSON.stringify({ drifted, ok, skipped }), 'utf8');
NODEJS

# ── Stampa risultati ─────────────────────────────────────────────────────────
node - "$DRIFT_TMP" <<'NODEJS'
const fs   = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

for (const { pkg, bowieVersion, rootVersion } of data.ok) {
  console.log(`  \x1b[32m✔\x1b[0m  ${pkg.padEnd(35)} bowie=${bowieVersion}  root=${rootVersion}`);
}
for (const { pkg, bowieVersion, reason } of data.skipped) {
  console.log(`  \x1b[36mℹ\x1b[0m  ${pkg.padEnd(35)} bowie=${bowieVersion}  (skip: ${reason})`);
}
if (data.drifted.length > 0) {
  console.log('');
  for (const { pkg, bowieVersion, rootVersion, declaredRange } of data.drifted) {
    console.log(`  \x1b[31m✖\x1b[0m  ${pkg.padEnd(35)} bowie=${bowieVersion}  root=${rootVersion}  range="${declaredRange}"  \x1b[1m← DRIFT\x1b[0m`);
  }
}
NODEJS

DRIFT_COUNT=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).drifted.length))" "$DRIFT_TMP")
OK_COUNT=$(node    -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).ok.length))"      "$DRIFT_TMP")

echo ""

if [ "$DRIFT_COUNT" -gt 0 ]; then
  SUFFIX=$([ "$DRIFT_COUNT" -eq 1 ] && echo "o" || echo "i")

  if [ "$WARN_ONLY" = true ]; then
    echo -e "  \033[1;33m⚠  DRIFT RILEVATO — $DRIFT_COUNT pacchett${SUFFIX} Bowie Terminal in ritardo rispetto alla root (--warn-only, non bloccante)\033[0m"
    echo ""
    echo "  Per correggere, esegui:"
    echo "    cd bowie-terminal && npm install && cd .."
    echo "  Poi: git add bowie-terminal/package-lock.json && git commit"
    echo ""
    exit 0
  fi

  echo -e "  \033[0;31m\033[1mBUILD BLOCCATA — $DRIFT_COUNT pacchett${SUFFIX} di Bowie Terminal in ritardo rispetto alla root.\033[0m"
  echo ""
  echo "  Il lockfile bowie-terminal/package-lock.json non è aggiornato."
  echo "  Una build EAS remota usa questo lockfile (npm ci scoped) e compila"
  echo "  versioni stantie, potenzialmente incompatibili con l'SDK 56 corrente."
  echo ""
  echo "  ── Correzione ──────────────────────────────────────────────────────"
  echo "    cd bowie-terminal && npm install && cd .."
  echo "    git add bowie-terminal/package-lock.json"
  echo "    git commit -m 'chore(bowie): aggiorna lockfile a SDK 56 corrente'"
  echo "  ────────────────────────────────────────────────────────────────────"
  echo ""
  exit 1
fi

echo -e "  \033[0;32m✔\033[0m  Nessun drift — tutti i $OK_COUNT pacchetti Bowie Terminal sono allineati con la root."
echo ""
exit 0
