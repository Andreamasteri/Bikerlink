---
name: Semgrep CI gate quirks
description: Non-obvious gotchas for the baseline/ratchet Semgrep security gate (scripts/check-semgrep.sh)
---

# Semgrep CI gate

The gate: `scripts/check-semgrep.sh` (local rules `.semgrep/bikerlink.yml` + open
registry packs, NO login) vs frozen `.semgrep-baseline`; blocks only NEW
ERROR-severity findings. Wired into `scripts/post-merge.sh` (SEMGREP_EXIT pattern)
and registered as the `semgrep` validation command.

## Anonymous Semgrep redacts fingerprints
**Anonymous (no-login) Semgrep REDACTS `extra.fingerprint` AND `extra.lines` to the
literal string "requires login".** So you CANNOT use Semgrep's own fingerprint for a
baseline key.
**How to apply:** compute your own content fingerprint — read the snippet from disk
(start.line..end.line), strip/join whitespace, `sha1(check_id|snippet)[:12]`, plus an
occurrence index for duplicates. Baseline key = `severity\tcheck_id\tpath\tfphash`.
Because the key is content-based (not line-based), adding comments above a match does
NOT change its fingerprint — safe to annotate code without rebasing the baseline.

## Registry pack names
Valid open packs (anonymous): `p/javascript p/typescript p/nodejs p/expressjs
p/react p/owasp-top-ten p/secrets`. NOTE: `p/express` is 404 — it's `p/expressjs`.

## TS parser limitation
Semgrep's TS parser FAILS on arrow-body-with-content patterns; function-form parses
fine. Workaround for Express handlers: `pattern-inside: "$R.$M($PATH, $HANDLER)"` +
metavariable-regex on $R/$M + metavariable-pattern (pattern-not-regex) on $HANDLER.

## Core engine can be ABSENT → placeholder output, not a real finding
In the Replit nix sandbox the semgrep package can ship WITHOUT the OCaml core engine
(`semgrep-core`/`osemgrep`): `.../site-packages/semgrep/bin/` has only `__init__.py`.
Then `semgrep --version` works (pure python) but ANY scan exits 0 while pysemgrep
writes the literal placeholder `<ERROR: missing output>` (from `rpc_call.py`, RPC to
the missing core returns nothing) — NOT valid JSON, NOT a finding. `.pythonlibs`
PYTHONPATH pollution is a separate failure (ModuleNotFoundError pydantic_core) already
handled by `env -u PYTHONPATH`.
**Why:** feeding that placeholder to the downstream `json.load()` crashes under
`set -euo pipefail`, aborting the whole `post-merge.sh` with a misleading "new ERROR
findings" message — even though nothing was scanned.
**How to apply:** after the semgrep run, VALIDATE the output is parseable JSON with a
`results` key BEFORE the ratchet parser. If not, soft-degrade (warn + `exit 0`) like the
missing-binary / unreachable-registry paths, unless `SEMGREP_STRICT=1` (fail hard for a
real CI with a working core). Do the check in an `if ! python3 ...; then` condition so
`set -e` doesn't abort on the expected parse failure.

## Run time vs the 2-min bash cap
Full scan ~80s–3.5min on 2 cores. The `bash` tool caps at 120s, so a foreground scan
there may report exit -1 while the detached process still finishes and writes the
baseline. To verify the gate end-to-end reliably, use `startValidationRun(["semgrep"])`
(longer execution budget) instead of the bash tool. Background `nohup` gets killed when
the bash tool call returns — don't rely on it.
