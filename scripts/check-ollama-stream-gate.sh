#!/usr/bin/env bash
# check-ollama-stream-gate.sh
#
# Scopo: prevenire che un futuro callOllamaChat con numPredict > 700 venga
# introdotto senza stream: true, causando un CF 524 timeout.
#
# CONTESTO OPERATIVO (Task #738):
#   Cloudflare chiude le connessioni idle dopo 100 s. Un callOllamaChat con
#   numPredict alto produce un unico blocco di risposta; su hardware lento
#   (GTX 1070, ~27 tok/s) 700 token impiegano già ~26 s. Valori come 1200,
#   1600 o 4000 superano facilmente i 100 s e producono un 524 silenzioso.
#
#   Con stream:true Ollama emette token via SSE → ogni chunk azzera il
#   keepalive CF → nessun 524 indipendentemente dalla lunghezza totale.
#
# INVARIANTE:
#   callOllamaChat( ..., { numPredict: N > 700, stream: true, ... } )
#
# COSA CONTROLLA:
#   Per ogni call site callOllamaChat() in server/ e scripts/:
#     1. Estrae il valore di numPredict (numero letterale O costante
#        numerica definita nello stesso file).
#     2. Se numPredict > 700 e stream: true è assente → FAIL.
#
#   Costanti da altri file (import) non sono risolte per semplicità: in
#   quel caso rare, aggiungere una soppressione documentata.
#
# SOPPRESSIONE (caso raro dove stream non è necessario, documentato):
#   // check-ollama-stream-gate: safe
#   Il commento deve essere sulla riga immediatamente precedente o sulla
#   stessa riga della chiamata callOllamaChat.
#
# Directory scansionate: server/ e scripts/
# Escluse: server/__tests__/ (test, non produzione)
#
# Vedi: .agents/memory/horus-direct-call-method.md
#        server/ai/nadir/translate.ts (TRANSLATE_NUM_PREDICT=4000, stream:true)
#        server/ai/assistant/inter-agent.ts (numPredict:1600, stream:true)
#        server/ai/assistant/task-review.ts (numPredict:1200, stream:true)

set -euo pipefail

python3 - << 'PYEOF'
import os
import re
import sys

SCAN_DIRS = ["server", "scripts"]
EXCLUDED_SUBDIRS = {"node_modules", ".git", "__pycache__", "__tests__"}
# Exclude this script itself from scanning.
EXCLUDED_FILES = {"scripts/check-ollama-stream-gate.sh"}
SUPPRESSION = "check-ollama-stream-gate: safe"
THRESHOLD = 700


def collect_files(scan_dirs, excluded_subdirs, excluded_files):
    for scan_dir in scan_dirs:
        if not os.path.isdir(scan_dir):
            continue
        for root, dirs, files in os.walk(scan_dir):
            dirs[:] = [d for d in dirs if d not in excluded_subdirs]
            for fname in files:
                if not any(fname.endswith(ext) for ext in (".ts", ".tsx", ".js", ".jsx")):
                    continue
                fpath = os.path.join(root, fname)
                display_path = fpath.lstrip("./")
                if display_path in excluded_files:
                    continue
                yield fpath, display_path


def extract_call_block(content, after_pos):
    """
    Starting from after_pos (right before the opening '(' of callOllamaChat),
    return (block_text, line_number_of_opening_paren, paren_position).
    block_text includes the parentheses themselves.
    Returns (None, None, None) on failure.
    """
    paren_pos = content.find("(", after_pos)
    if paren_pos == -1:
        return None, None, None

    line_num = content[:paren_pos].count("\n") + 1

    depth = 0
    i = paren_pos
    in_string_single = False
    in_string_double = False
    in_template = False
    prev_char = ""
    while i < len(content):
        c = content[i]
        if c == "'" and not in_string_double and not in_template and prev_char != "\\":
            in_string_single = not in_string_single
        elif c == '"' and not in_string_single and not in_template and prev_char != "\\":
            in_string_double = not in_string_double
        elif c == "`" and not in_string_single and not in_string_double and prev_char != "\\":
            in_template = not in_template
        elif not in_string_single and not in_string_double and not in_template:
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return content[paren_pos : i + 1], line_num, paren_pos
        prev_char = c
        i += 1

    return None, None, None


def extract_file_constants(content):
    """
    Return a dict of { name: int_value } for all top-level numeric const/let/var
    declarations in the file.
    """
    pattern = re.compile(
        r'(?m)^[ \t]*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(\d+)\s*[;]'
    )
    constants = {}
    for m in pattern.finditer(content):
        try:
            constants[m.group(1)] = int(m.group(2))
        except ValueError:
            pass
    return constants


def check_call_block(block, constants):
    """
    Returns (num_predict_value_or_None, has_stream_true).
    num_predict_value is None if absent or unresolvable.
    """
    num_predict = None
    np_match = re.search(r'\bnumPredict\s*:\s*([A-Za-z_]\w*|\d+)', block)
    if np_match:
        raw = np_match.group(1)
        if raw.isdigit():
            num_predict = int(raw)
        elif raw in constants:
            num_predict = constants[raw]
        # Unresolvable import-level constant → conservative: skip (no false positive).

    has_stream_true = bool(re.search(r'\bstream\s*:\s*true\b', block))
    return num_predict, has_stream_true


def is_suppressed(content, call_identifier_pos):
    """
    True if a suppression comment appears on the same line or the line
    immediately preceding the callOllamaChat identifier.
    """
    line_start = content.rfind("\n", 0, call_identifier_pos) + 1
    current_line = content[line_start : content.find("\n", call_identifier_pos)]
    if SUPPRESSION in current_line:
        return True
    if line_start > 0:
        prev_line_end = line_start - 1
        prev_line_start = content.rfind("\n", 0, prev_line_end) + 1
        prev_line = content[prev_line_start:prev_line_end]
        if SUPPRESSION in prev_line:
            return True
    return False


violations = []

for fpath, display_path in collect_files(SCAN_DIRS, EXCLUDED_SUBDIRS, EXCLUDED_FILES):
    try:
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except OSError:
        continue

    if "callOllamaChat" not in content:
        continue

    constants = extract_file_constants(content)

    pos = 0
    while True:
        idx = content.find("callOllamaChat(", pos)
        if idx == -1:
            break
        pos = idx + 1

        # Skip occurrences inside single-line comments.
        line_start = content.rfind("\n", 0, idx) + 1
        line_before_match = content[line_start:idx]
        stripped = line_before_match.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue

        # idx points to 'c' of callOllamaChat; the '(' is at idx+len("callOllamaChat")
        block, line_num, _paren_pos = extract_call_block(
            content, idx + len("callOllamaChat")
        )
        if block is None:
            continue

        num_predict, has_stream_true = check_call_block(block, constants)

        if num_predict is None or num_predict <= THRESHOLD:
            continue
        if has_stream_true:
            continue

        if is_suppressed(content, idx):
            continue

        violations.append(
            f"{display_path}:{line_num}: numPredict={num_predict} without stream:true"
        )

if violations:
    print("")
    for v in violations:
        print(f"  FAIL: {v}")
    print("")
    print(f"  check-ollama-stream-gate FAILED: callOllamaChat with numPredict > {THRESHOLD} must set stream:true.")
    print("")
    print("  WHY THIS MATTERS:")
    print("    Cloudflare closes idle connections after 100 s. A high numPredict call")
    print("    produces a single large response; on the GTX 1070 (~27 tok/s), even")
    print("    ~700 tokens take ~26 s. Values of 1200, 1600 or 4000 easily exceed")
    print("    100 s of silence, producing a CF 524 timeout for all clients.")
    print("    With stream:true, Ollama emits tokens via SSE — each chunk resets the")
    print("    CF keepalive timer, so no 524 regardless of total output length.")
    print("")
    print("  FIX: add stream:true to the callOllamaChat options, e.g.:")
    print("    await callOllamaChat(prompt, undefined, {")
    print("      numPredict: 1200,")
    print("      stream: true,   // <-- add this")
    print("      ...,")
    print("    });")
    print("")
    print("  OVERRIDE (only if stream is genuinely not needed and latency is verified):")
    print("    Add the following comment on the line immediately before the call:")
    print("      // check-ollama-stream-gate: safe")
    print("")
    print("  Reference: .agents/memory/horus-direct-call-method.md")
    sys.exit(1)
else:
    print("  OK - All callOllamaChat calls with numPredict > 700 have stream:true")
    print("")
    print("check-ollama-stream-gate PASSED")
    sys.exit(0)
PYEOF
