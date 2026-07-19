#!/usr/bin/env bash
# check-horus-batch-size.sh
#
# Scopo: prevenire una regressione del valore BATCH_SIZE nelle scansioni Horus.
#
# CONTESTO OPERATIVO:
#   BATCH_SIZE = 4 controlla quanti file Horus processa per tick durante una
#   scansione. Se alzato troppo satura la coda Ollama e causa timeout CF a cascata
#   (ogni file richiede una o due call Ollama da ~26 s ciascuna; con batch grandi
#   i tick impiegano minuti, accumulando backpressure sull'endpoint /api/ai-stream).
#   Il valore 4 è il ceiling sicuro misurato sul ThinkCentre (GTX 1070).
#
# COSA CONTROLLA:
#   Legge il valore numerico della costante:
#     - BATCH_SIZE in server/ai/assistant/horus-scanner.ts
#   e fallisce se supera MAX_ALLOWED (4).
#
# SOPPRESSIONE (caso eccezionale documentato):
#   Se il limite deve essere alzato in modo deliberato e motivato, aggiungere
#   immediatamente prima della riga della costante:
#     // check-horus-batch-size: safe
#   Il commento va sulla riga immediatamente precedente OPPURE sulla stessa riga.
#
# Vedi: .agents/memory/horus-direct-call-method.md
#        server/ai/assistant/horus-scanner.ts (BATCH_SIZE)

set -euo pipefail

python3 - << 'PYEOF'
import os
import re
import sys

MAX_ALLOWED = 4
SUPPRESSION = "check-horus-batch-size: safe"

# Each entry: (file_path, constant_name)
TARGETS = [
    ("server/ai/assistant/horus-scanner.ts", "BATCH_SIZE"),
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
    print("  check-horus-batch-size FAILED: one or more target constants could not be located.")
    print("  Update TARGETS in this script if the file or constant was renamed.")

if violations:
    all_ok = False
    print("")
    for v in violations:
        print(f"  FAIL: {v}")
    print("")
    print(f"  check-horus-batch-size FAILED: BATCH_SIZE exceeds {MAX_ALLOWED}.")
    print("")
    print("  WHY THIS MATTERS:")
    print("    BATCH_SIZE controls how many files Horus processes per tick.")
    print("    Each file requires 1-2 Ollama calls (~26 s each at GTX 1070 speed).")
    print("    A large batch saturates the Ollama queue and triggers cascading CF")
    print("    timeouts on /api/ai-stream, stalling or breaking the entire scan.")
    print(f"    The safe ceiling is {MAX_ALLOWED} (measured on the ThinkCentre GTX 1070).")
    print("")
    print(f"  FIX: restore BATCH_SIZE to {MAX_ALLOWED} or below.")
    print("")
    print("  OVERRIDE (only if you have measured queue saturation and confirmed it is safe):")
    print("    Add the following comment on the line immediately before the constant:")
    print("      // check-horus-batch-size: safe")
    print("")
    print("  Reference: .agents/memory/horus-direct-call-method.md")

if all_ok:
    for fpath, name in TARGETS:
        print(f"  OK - {name} in {fpath} is within the allowed limit ({MAX_ALLOWED})")
    print("")
    print("check-horus-batch-size PASSED")
    sys.exit(0)
else:
    sys.exit(1)
PYEOF
