#!/usr/bin/env bash
# Deterministic preflight for the ThinkCentre (host: bikerlink) local Android staging build.
# It never runs EAS build, Gradle, npm install, or changes project files.
#
# Usage (from the repository checkout):
#   EXPO_TOKEN="…" bash scripts/thinkcentre/preflight-local-android-build.sh

set -uo pipefail

failures=0
warnings=0

ok()   { printf 'OK    %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$*" >&2; failures=$((failures + 1)); }

require_file() {
  local file="$1"
  if [ -e "$file" ]; then
    ok "$file"
  else
    fail "manca: $file"
  fi
}

printf '%s\n' '=== BIKERLINK — PREFLIGHT APK STAGING LOCALE ==='
printf '%s\n' 'Questa verifica non avvia build EAS/Gradle e non modifica file.'

if [ "$(hostname -s 2>/dev/null || true)" = "bikerlink" ]; then
  ok "host ThinkCentre: bikerlink"
else
  fail "questo non è il ThinkCentre (hostname atteso: bikerlink)"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "esegui lo script dentro il checkout Git di BikerLink"
  printf '\nEsito: BLOCCATO (%s errori). Nessuna build è stata avviata.\n' "$failures"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" || exit 1
ok "repository: $REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  fail "worktree non pulito: non è sicuro avviare una build riproducibile"
  git status --short
else
  ok "worktree pulito"
fi

COMMIT="$(git rev-parse HEAD)"
ok "commit: $COMMIT"

NODE_HOME="${NODE_HOME:-/home/andrea/.local/share/bikerlink-builder/node-v22.23.0-linux-x64}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
ANDROID_HOME="${ANDROID_HOME:-/home/andrea/.local/share/android-sdk}"
ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/27.1.12297006}"
EAS_RUN="${EAS_RUN:-/home/andrea/.local/share/bikerlink-builder/eas-cli/node_modules/eas-cli/bin/run}"
STAGING_DOMAIN="bikerlink-staging-staging.up.railway.app"

export JAVA_HOME ANDROID_HOME ANDROID_NDK_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_ROOT="$ANDROID_NDK_HOME"
export PATH="$NODE_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

require_file "$NODE_HOME/bin/node"
require_file "$JAVA_HOME/bin/java"
require_file "$ANDROID_HOME/platform-tools/adb"
require_file "$ANDROID_NDK_HOME/ndk-build"
require_file "$EAS_RUN"

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version)"
  case "$NODE_VERSION" in
    v22.23.*) ok "Node: $NODE_VERSION" ;;
    *) fail "Node errato: $NODE_VERSION (richiesto 22.23.x)" ;;
  esac
else
  fail "Node non disponibile"
fi

if command -v npm >/dev/null 2>&1; then
  NPM_VERSION="$(npm --version)"
  case "$NPM_VERSION" in
    10.9.*) ok "npm: $NPM_VERSION" ;;
    *) fail "npm inatteso: $NPM_VERSION (richiesto 10.9.x)" ;;
  esac
else
  fail "npm non disponibile"
fi

if [ -x "$JAVA_HOME/bin/java" ]; then
  JAVA_VERSION="$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
  case "$JAVA_VERSION" in
    *"17."*) ok "JDK: $JAVA_VERSION" ;;
    *) fail "JDK errato: $JAVA_VERSION (richiesto Java 17)" ;;
  esac
fi

if node -e '
const fs = require("fs");
const config = require("./app.json").expo;
if (!config.plugins.includes("./plugins/with-gradle-jvm-memory")) process.exit(1);
const plugin = fs.readFileSync("plugins/with-gradle-jvm-memory.js", "utf8");
if (!plugin.includes("org.gradle.jvmargs") || !plugin.includes("MaxMetaspaceSize=1024m")) process.exit(1);
require("./plugins/with-gradle-jvm-memory");
'; then
  ok "Gradle Metaspace generata da config plugin: 1024m"
else
  fail "config plugin Gradle Metaspace assente, incompleta o non caricabile"
fi

if node --check metro.config.js >/dev/null 2>&1 && node -e "require('./metro.config.js')" >/dev/null 2>&1; then
  ok "Metro config valida e caricabile"
else
  fail "Metro config non valida o non caricabile"
fi

if node -e "require.resolve('expo-router/entry')" >/dev/null 2>&1; then
  ok "expo-router/entry risolvibile"
else
  fail "expo-router/entry non risolvibile nelle dipendenze locali"
fi

if grep -Fxq '!scripts/patch-package-safe.cjs' .easignore && grep -Fxq '!scripts/patch-metro-image-size.cjs' .easignore; then
  ok ".easignore include gli script postinstall richiesti"
else
  fail ".easignore non include tutti gli script postinstall richiesti"
fi

if node - "$STAGING_DOMAIN" <<'NODE'
const profile = require("./eas.json")?.build?.preview;
const expected = process.argv[2];
if (profile?.channel !== "staging") throw new Error("canale preview non staging");
if (profile?.env?.EXPO_PUBLIC_DOMAIN !== expected) throw new Error("dominio preview non staging");
console.log("profile preview: staging verificato");
NODE
then
  ok "profilo EAS preview/staging"
else
  fail "profilo EAS preview/staging non coerente"
fi

if [ -f "$EAS_RUN" ] && node "$EAS_RUN" --version >/dev/null 2>&1; then
  ok "EAS CLI locale eseguibile"
else
  fail "EAS CLI locale non eseguibile"
fi

BUILD_WORKDIR="${EAS_LOCAL_BUILD_WORKINGDIR:-/home/andrea/.cache/bikerlink-eas/work}"
BUILD_VOLUME="$(dirname "$BUILD_WORKDIR")"
while [ ! -d "$BUILD_VOLUME" ] && [ "$BUILD_VOLUME" != "/" ]; do
  BUILD_VOLUME="$(dirname "$BUILD_VOLUME")"
done
AVAILABLE_KB="$(df -Pk "$BUILD_VOLUME" 2>/dev/null | awk 'END {print $4}')"
if [ -n "$AVAILABLE_KB" ] && [ "$AVAILABLE_KB" -ge 26214400 ]; then
  ok "spazio workspace build ($BUILD_VOLUME): $((AVAILABLE_KB / 1024 / 1024)) GiB"
else
  fail "spazio workspace build insufficiente in $BUILD_VOLUME (servono almeno 25 GiB)"
fi

if [ -n "${EXPO_TOKEN:-}" ]; then
  if node "$EAS_RUN" whoami --non-interactive; then
    ok "token Expo/EAS valido"
  else
    fail "token Expo/EAS non valido o non autorizzato"
  fi
else
  fail "EXPO_TOKEN assente: esportalo prima di eseguire il preflight"
fi

unset EXPO_TOKEN || true

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Esito: PRONTO (%s avvisi). Nessuna build è stata avviata.\n' "$warnings"
  exit 0
fi

printf 'Esito: BLOCCATO (%s errori, %s avvisi). Nessuna build è stata avviata.\n' "$failures" "$warnings"
exit 1
