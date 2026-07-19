#!/usr/bin/env bash
# check-horus-tick-delay.sh
#
# Scopo: prevenire una regressione del valore TICK_DELAY_MS nelle scansioni Horus.
#
# CONTESTO OPERATIVO:
#   TICK_DELAY_MS = 1500 è la pausa (in ms) tra un lotto e il successivo durante
#   una scansione Horus. Se abbassato a zero o a un valore troppo piccolo, i lotti
#   vengono sparati in rapida successione saturando la coda Ollama e causando
#   timeout CF a cascata sull'endpoint /api/ai-stream — la stessa classe di
#   problema che BATCH_SIZE e NUM_PREDICT già presidiano.
#   Il valore 1500 ms è il floor sicuro misurato sul ThinkCentre (GTX 1070).
#
# COSA CONTROLLA:
#   Legge il valore numerico della costante:
#     - TICK_DELAY_MS in server/ai/assistant/horus-scanner.ts
#   e fallisce se scende sotto MIN_ALLOWED (1500).
#
# SOPPRESSIONE (caso eccezionale documentato):
#   Se il limite deve essere abbassato in modo deliberato e motivato, aggiungere
#   immediatamente prima della riga della costante:
#     // check-horus-tick-delay: safe
#   Il commento va sulla riga immediatamente precedente OPPURE sulla stessa riga.
#
# Vedi: .agents/memory/horus-direct-call-method.md
#        server/ai/assistant/horus-scanner.ts (TICK_DELAY_MS)

set -euo pipefail

python3 - << 'PYEOF'
import os
import re
import sys

MIN_ALLOWED = 1500
SUPPRESSION = "check-horus-tick-delay: safe"

# Each entry: (file_path, constant_name)
TARGETS = [
    ("server/ai/assistant/horus-scanner.ts", "TICK_DELAY_MS"),
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
    print("  check-horus-tick-delay FAILED: one or more target constants could not be located.")
    print("  Update TARGETS in this script if the file or constant was renamed.")

if violations:
    all_ok = False
    print("")
    for v in violations:
        print(f"  FAIL: {v}")
    print("")
    print(f"  check-horus-tick-delay FAILED: TICK_DELAY_MS is below {MIN_ALLOWED} ms.")
    print("")
    print("  WHY THIS MATTERS:")
    print("    TICK_DELAY_MS is the pause between scan batches in the Horus scanner.")
    print("    Setting it to zero or a very small value fires batches back-to-back,")
    print("    saturating the Ollama queue and triggering cascading CF timeouts on")
    print("    /api/ai-stream — the same class of problem BATCH_SIZE guards against.")
    print(f"    The safe floor is {MIN_ALLOWED} ms (measured on the ThinkCentre GTX 1070).")
    print("")
    print(f"  FIX: restore TICK_DELAY_MS to {MIN_ALLOWED} or above.")
    print("")
    print("  OVERRIDE (only if you have measured queue saturation and confirmed it is safe):")
    print("    Add the following comment on the line immediately before the constant:")
    print("      // check-horus-tick-delay: safe")
    print("")
    print("  Reference: .agents/memory/horus-direct-call-method.md")

if all_ok:
    for fpath, name in TARGETS:
        print(f"  OK - {name} in {fpath} is at or above the safe floor ({MIN_ALLOWED} ms)")
    print("")
    print("check-horus-tick-delay PASSED")
    sys.exit(0)
else:
    sys.exit(1)
PYEOF
