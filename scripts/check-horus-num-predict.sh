#!/usr/bin/env bash
# check-horus-num-predict.sh
#
# Scopo: prevenire una regressione del valore NUM_PREDICT nelle scansioni Horus.
#
# CONTESTO OPERATIVO:
#   Timeout Cloudflare = 100 s, GTX 1070 ~27 tok/s → max ~700 token/call (~26 s).
#   NOTE_NUM_PREDICT e SECURITY_NOTE_NUM_PREDICT sono stati abbassati manualmente a 700.
#   Se qualcuno li rialzasse, una cold scan (2233 file × 2 call) tornerebbe a
#   durare > 100 ore invece di ~20-25 min, e ogni singola call andrebbe in timeout CF.
#
# COSA CONTROLLA:
#   Legge il valore numerico delle costanti:
#     - NOTE_NUM_PREDICT          in server/ai/assistant/horus-scanner.ts
#     - SECURITY_NOTE_NUM_PREDICT in server/ai/assistant/horus-scanner-security.ts
#   e fallisce se uno dei due supera MAX_ALLOWED (700).
#
# SOPPRESSIONE (caso eccezionale documentato):
#   Se il limite deve essere alzato in modo deliberato e motivato, aggiungere
#   immediatamente prima della riga della costante:
#     // check-horus-num-predict: safe
#   Il commento va sulla riga immediatamente precedente OPPURE sulla stessa riga.
#
# Vedi: .agents/memory/horus-direct-call-method.md
#        server/ai/assistant/horus-scanner.ts (NOTE_NUM_PREDICT)
#        server/ai/assistant/horus-scanner-security.ts (SECURITY_NOTE_NUM_PREDICT)

set -euo pipefail

python3 - << 'PYEOF'
import os
import re
import sys

MAX_ALLOWED = 700
SUPPRESSION = "check-horus-num-predict: safe"

# Each entry: (file_path, constant_name)
TARGETS = [
    ("server/ai/assistant/horus-scanner.ts",          "NOTE_NUM_PREDICT"),
    ("server/ai/assistant/horus-scanner-security.ts", "SECURITY_NOTE_NUM_PREDICT"),
]

# Matches:  (export )?(const|let|var) <NAME> = <integer>;
# Captures the integer value in group 1.
def make_re(name: str) -> re.Pattern:
    return re.compile(
        r'\b(?:export\s+)?(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*(\d+)\s*;'
    )

violations = []
missing = []

for fpath, name in TARGETS:
    if not os.path.isfile(fpath):
        missing.append(f"{fpath}: file not found (expected {name})")
        continue

    pattern = make_re(name)
    try:
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except OSError as e:
        missing.append(f"{fpath}: cannot read: {e}")
        continue

    found = False
    for i, line in enumerate(lines):
        m = pattern.search(line)
        if not m:
            continue
        found = True
        lineno = i + 1
        value = int(m.group(1))

        if value <= MAX_ALLOWED:
            continue  # OK

        # Check suppression: same line or immediately preceding line
        suppressed = SUPPRESSION in line
        if not suppressed and i > 0:
            suppressed = SUPPRESSION in lines[i - 1]
        if suppressed:
            continue

        violations.append(
            f"{fpath}:{lineno}: {name} = {value}  (max allowed: {MAX_ALLOWED})"
        )

    if not found:
        missing.append(f"{fpath}: constant '{name}' not found — was it renamed?")

all_ok = True

if missing:
    all_ok = False
    print("")
    for m in missing:
        print(f"  ERROR: {m}")
    print("")
    print("  check-horus-num-predict FAILED: one or more target constants could not be located.")
    print("  Update TARGETS in this script if the file or constant was renamed.")

if violations:
    all_ok = False
    print("")
    for v in violations:
        print(f"  FAIL: {v}")
    print("")
    print(f"  check-horus-num-predict FAILED: NUM_PREDICT exceeds {MAX_ALLOWED}.")
    print("")
    print("  WHY THIS MATTERS:")
    print("    Cloudflare timeout = 100 s, GTX 1070 ~27 tok/s → max ~700 tok/call (~26 s).")
    print("    Raising these values causes every per-file call to time out at the CF edge,")
    print("    turning a 20-25 min scan into a 100+ hour unfinished run.")
    print("")
    print("  FIX: restore the value to 700 or below.")
    print("")
    print("  OVERRIDE (only if you have measured the live latency and confirmed it is safe):")
    print("    Add the following comment on the line immediately before the constant:")
    print("      // check-horus-num-predict: safe")
    print("")
    print("  Reference: .agents/memory/horus-direct-call-method.md")

if all_ok:
    for fpath, name in TARGETS:
        print(f"  OK - {name} in {fpath} is within the allowed limit ({MAX_ALLOWED})")
    print("")
    print("check-horus-num-predict PASSED")
    sys.exit(0)
else:
    sys.exit(1)
PYEOF
