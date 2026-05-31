#!/usr/bin/env bash
# =============================================================================
# test-check-env-quoted.sh
# Regression tests for the check_env_quoted function defined in
# infra/self-host/lib/env-helpers.sh and used by setup.sh / setup-missing.sh.
#
# The test sources the REAL production implementation so that any future
# edit to check_env_quoted is automatically exercised here.
#
# Usage:
#   bash infra/self-host/tests/test-check-env-quoted.sh
#
# Exit code: 0 all tests pass, 1 one or more tests failed.
# No external dependencies — pure bash.
# =============================================================================
set -uo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"

# ── Load the real production implementation ───────────────────────────────────
# Source env-helpers.sh.  die() calls exit 1; we override it in subshells when
# we want to capture the exit code without stopping the test runner itself.
# shellcheck source=../lib/env-helpers.sh
source "${LIB_DIR}/env-helpers.sh"

PASS=0
FAIL=0

_ok()   { echo "  PASS: $*"; ((PASS++)) || true; }
_fail() { echo "  FAIL: $*" >&2; ((FAIL++)) || true; }

# Run check_env_quoted in a subshell so that die/exit does not abort the runner.
_run() {
  local envf="$1"
  (
    # shellcheck source=../lib/env-helpers.sh
    source "${LIB_DIR}/env-helpers.sh"
    check_env_quoted "$envf"
  )
  return $?
}

# ── Fixtures ──────────────────────────────────────────────────────────────────

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# — Should FAIL (rejected by check_env_quoted) ———————————————————————————————

cat > "$TMP_DIR/unquoted_spaces.env" <<'EOF'
KEY_OK=simple
KEY_BAD=value with spaces
EOF

cat > "$TMP_DIR/unquoted_semicolon.env" <<'EOF'
KEY_BAD=foo;bar
EOF

cat > "$TMP_DIR/unquoted_pipe.env" <<'EOF'
KEY_BAD=foo|bar
EOF

cat > "$TMP_DIR/unquoted_ampersand.env" <<'EOF'
KEY_BAD=foo&bar
EOF

cat > "$TMP_DIR/unquoted_backtick.env" <<'EOF'
KEY_BAD=foo`date`
EOF

cat > "$TMP_DIR/unquoted_paren.env" <<'EOF'
KEY_BAD=foo(bar)
EOF

cat > "$TMP_DIR/unquoted_tab.env" <<'EOF'
KEY_BAD=foo	bar
EOF

# — Should PASS (accepted by check_env_quoted) ————————————————————————————————

cat > "$TMP_DIR/quoted_double.env" <<'EOF'
# comment line
SIMPLE=nospace
KEY_SPACES="value with spaces"
KEY_SEMI="foo;bar"
KEY_PIPE="foo|bar"
KEY_AMP="foo&bar"
KEY_OPTS="-Xmx8g -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
EOF

cat > "$TMP_DIR/quoted_single.env" <<'EOF'
KEY_SPACES='value with spaces'
KEY_SEMI='foo;bar'
KEY_PIPE='foo|bar'
EOF

# Empty file
: > "$TMP_DIR/empty.env"

# Only comments and blank lines
cat > "$TMP_DIR/comments_only.env" <<'EOF'
# This is a comment
  # indented comment

EOF

# Mirrors the exact heredoc written by setup.sh — GRAPHHOPPER_JAVA_OPTS with
# JVM flags is the canonical multi-word value that triggered the original bug.
cat > "$TMP_DIR/setup_sh_heredoc.env" <<'EOF'
# Generato automaticamente da setup.sh il 2026-05-31 00:00:00
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER="bikerlink"
POSTGRES_PASSWORD="aB3xKq9rTn2pLm7vYw4zEc6jHs0uGf1i"
POSTGRES_DB="bikerlink_db"
PGADMIN_EMAIL="admin@bikerlink.local"
PGADMIN_PASSWORD="Cd8nRt5pWq2mXv9yZa3bEk7lHj1uGf4s"
GRAPHHOPPER_JAVA_OPTS="-Xmx8g -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
EOF

# Mirrors the exact heredoc written by setup-missing.sh (fixed 16 g heap).
cat > "$TMP_DIR/setup_missing_sh_heredoc.env" <<'EOF'
# Generato automaticamente da setup-missing.sh il 2026-05-31 00:00:00
# NON committare questo file. Contiene le credenziali dei servizi locali.
POSTGRES_USER="bikerlink"
POSTGRES_PASSWORD="aB3xKq9rTn2pLm7vYw4zEc6jHs0uGf1i"
POSTGRES_DB="bikerlink_db"
PGADMIN_EMAIL="admin@bikerlink.local"
PGADMIN_PASSWORD="Cd8nRt5pWq2mXv9yZa3bEk7lHj1uGf4s"
GRAPHHOPPER_JAVA_OPTS="-Xmx16g -Xms4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
EOF

# ── Test cases ────────────────────────────────────────────────────────────────

echo
echo "Running check_env_quoted tests (sourcing lib/env-helpers.sh)…"
echo

# T01 — unquoted value with spaces → must be rejected
if ! _run "$TMP_DIR/unquoted_spaces.env" 2>/dev/null; then
  _ok "T01: unquoted spaces value → rejected (exit non-zero)"
else
  _fail "T01: unquoted spaces value → should have been rejected"
fi

# T02 — unquoted semicolon → must be rejected
if ! _run "$TMP_DIR/unquoted_semicolon.env" 2>/dev/null; then
  _ok "T02: unquoted semicolon value → rejected"
else
  _fail "T02: unquoted semicolon value → should have been rejected"
fi

# T03 — unquoted pipe → must be rejected
if ! _run "$TMP_DIR/unquoted_pipe.env" 2>/dev/null; then
  _ok "T03: unquoted pipe value → rejected"
else
  _fail "T03: unquoted pipe value → should have been rejected"
fi

# T04 — unquoted ampersand → must be rejected
if ! _run "$TMP_DIR/unquoted_ampersand.env" 2>/dev/null; then
  _ok "T04: unquoted ampersand value → rejected"
else
  _fail "T04: unquoted ampersand value → should have been rejected"
fi

# T05 — unquoted backtick → must be rejected
if ! _run "$TMP_DIR/unquoted_backtick.env" 2>/dev/null; then
  _ok "T05: unquoted backtick value → rejected"
else
  _fail "T05: unquoted backtick value → should have been rejected"
fi

# T06 — unquoted parenthesis → must be rejected
if ! _run "$TMP_DIR/unquoted_paren.env" 2>/dev/null; then
  _ok "T06: unquoted parenthesis value → rejected"
else
  _fail "T06: unquoted parenthesis value → should have been rejected"
fi

# T07 — unquoted tab character → must be rejected
if ! _run "$TMP_DIR/unquoted_tab.env" 2>/dev/null; then
  _ok "T07: unquoted tab value → rejected"
else
  _fail "T07: unquoted tab value → should have been rejected"
fi

# T08 — all values double-quoted (including spaces and meta-chars) → must pass
if _run "$TMP_DIR/quoted_double.env" 2>/dev/null; then
  _ok "T08: double-quoted values with unsafe chars → accepted"
else
  _fail "T08: double-quoted values with unsafe chars → should be accepted"
fi

# T09 — all values single-quoted → must pass
if _run "$TMP_DIR/quoted_single.env" 2>/dev/null; then
  _ok "T09: single-quoted values with unsafe chars → accepted"
else
  _fail "T09: single-quoted values with unsafe chars → should be accepted"
fi

# T10 — empty file → must pass
if _run "$TMP_DIR/empty.env" 2>/dev/null; then
  _ok "T10: empty .env file → accepted"
else
  _fail "T10: empty .env file → should be accepted"
fi

# T11 — comments and blank lines only → must pass
if _run "$TMP_DIR/comments_only.env" 2>/dev/null; then
  _ok "T11: comments/blanks-only file → accepted"
else
  _fail "T11: comments/blanks-only file → should be accepted"
fi

# T12 — non-existent file → must pass silently (function returns 0 by spec)
if _run "$TMP_DIR/nonexistent.env" 2>/dev/null; then
  _ok "T12: non-existent file → silently accepted (return 0)"
else
  _fail "T12: non-existent file → should be silently accepted"
fi

# T13 — setup.sh heredoc output → must pass (regression guard)
if _run "$TMP_DIR/setup_sh_heredoc.env" 2>/dev/null; then
  _ok "T13: setup.sh heredoc output → passes check"
else
  _fail "T13: setup.sh heredoc output → should pass check"
fi

# T14 — setup-missing.sh heredoc output → must pass (regression guard)
if _run "$TMP_DIR/setup_missing_sh_heredoc.env" 2>/dev/null; then
  _ok "T14: setup-missing.sh heredoc output → passes check"
else
  _fail "T14: setup-missing.sh heredoc output → should pass check"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo
echo "Results: ${PASS} passed, ${FAIL} failed"
echo

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
