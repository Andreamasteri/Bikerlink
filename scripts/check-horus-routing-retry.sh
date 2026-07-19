#!/usr/bin/env bash
# check-horus-routing-retry.sh
#
# Scopo: prevenire una regressione del valore ROUTING_BUSY_RETRY_MS nelle scansioni Horus.
#
# CONTESTO OPERATIVO:
#   ROUTING_BUSY_RETRY_MS = 8000 è il tempo di attesa (in ms) prima che lo scanner
#   Horus riprovi quando la routing-AI è occupata (isRoutingAiBusy() == true).
#   Se abbassato a zero o a un valore troppo piccolo, lo scanner entra in un hot
#   loop contro il priority gate della routing-AI, producendo CPU pressure continua
#   e log noise senza mai cedere la precedenza ai job di routing.
#   Il valore 8000 ms è il floor sicuro documentato (ampiamente sopra il ciclo
#   scheduler della routing-AI, che gira nell'ordine dei secondi).
#
# COSA CONTROLLA:
#   Legge il valore numerico della costante:
#     - ROUTING_BUSY_RETRY_MS in server/ai/assistant/horus-scanner.ts
#   e fallisce se scende sotto MIN_ALLOWED (8000).
#
# SOPPRESSIONE (caso eccezionale documentato):
#   Se il limite deve essere abbassato in modo deliberato e motivato, aggiungere
#   immediatamente prima della riga della costante:
#     // check-horus-routing-retry: safe
#   Il commento va sulla riga immediatamente precedente OPPURE sulla stessa riga.
#
# Vedi: .agents/memory/horus-routing-correctness-namespace.md
#        server/ai/assistant/horus-scanner.ts (ROUTING_BUSY_RETRY_MS)

set -euo pipefail

python3 - << 'PYEOF'
import os
import re
import sys

MIN_ALLOWED = 8000
SUPPRESSION = "check-horus-routing-retry: safe"

# Each entry: (file_path, constant_name)
TARGETS = [
    ("server/ai/assistant/horus-scanner.ts", "ROUTING_BUSY_RETRY_MS"),
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

        if value >= MIN_ALLOWED:
            continue  # OK

        # Check suppression: same line or immediately preceding line
        suppressed = SUPPRESSION in line
        if not suppressed and i > 0:
            suppressed = SUPPRESSION in lines[i - 1]
        if suppressed:
            continue

        violations.append(
            f"{fpath}:{lineno}: {name} = {value}  (min allowed: {MIN_ALLOWED})"
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
    print("  check-horus-routing-retry FAILED: one or more target constants could not be located.")
    print("  Update TARGETS in this script if the file or constant was renamed.")

if violations:
    all_ok = False
    print("")
    for v in violations:
        print(f"  FAIL: {v}")
    print("")
    print(f"  check-horus-routing-retry FAILED: ROUTING_BUSY_RETRY_MS is below {MIN_ALLOWED} ms.")
    print("")
    print("  WHY THIS MATTERS:")
    print("    ROUTING_BUSY_RETRY_MS is the back-off delay before the Horus scanner")
    print("    retries when the routing-AI priority gate is busy.")
    print("    Setting it to zero or a very small value puts the scanner in a hot loop")
    print("    against the gate, generating continuous CPU pressure and log noise without")
    print("    ever yielding to the routing-AI jobs it is supposed to defer to.")
    print(f"    The safe floor is {MIN_ALLOWED} ms (well above the routing-AI scheduler cycle).")
    print("")
    print(f"  FIX: restore ROUTING_BUSY_RETRY_MS to {MIN_ALLOWED} or above.")
    print("")
    print("  OVERRIDE (only if you have measured the priority-gate cycle and confirmed it is safe):")
    print("    Add the following comment on the line immediately before the constant:")
    print("      // check-horus-routing-retry: safe")
    print("")
    print("  Reference: .agents/memory/horus-routing-correctness-namespace.md")

if all_ok:
    for fpath, name in TARGETS:
        print(f"  OK - {name} in {fpath} is at or above the safe floor ({MIN_ALLOWED} ms)")
    print("")
    print("check-horus-routing-retry PASSED")
    sys.exit(0)
else:
    sys.exit(1)
PYEOF
