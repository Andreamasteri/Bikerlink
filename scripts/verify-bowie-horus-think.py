#!/usr/bin/env python3
"""
Task #127 — Verifica chat 1:1 Bowie e Horus su ThinkCentre reale.
Testa think:true su qwen3:1.7b (Bowie) e qwen3:4b (Horus).

num_predict strategy:
  - qwen3:1.7b (Bowie): reasoning ~1600 chars (~400 tok), contenuto abbondante con 1200 total
  - qwen3:4b (Horus): reasoning ~4700 chars (~1200 tok), serve almeno 2500 total per avere
    ~1300 tok di contenuto (~5200 chars). Mirrors agent.ts che non cappa num_predict ma
    usa temperature:0.3 e think:true.

Eseguito direttamente sul ThinkCentre (Ollama localhost). Output su stdout → file.
"""

import json
import sys
import re
import time
import unicodedata
import urllib.request

OLLAMA_BASE = "http://localhost:11434"

# num_predict budget.
# qwen3:4b expands reasoning to fill the available budget (verified: 1200→1200tok reasoning,
# 2500→2500tok reasoning, content=0 in both). With short/focused prompts, reasoning stays
# shorter and leaves room for content. We use 4000 tokens: empirically ~1000-1500 tok
# reasoning on simple prompts leaves ~2500-3000 tok for content.
MODEL_NUM_PREDICT = {
    "qwen3:1.7b": 1200,  # reasoning ~400 tok, content abundant
    "qwen3:4b":   4000,  # short prompts → reasoning ~1000-1500 tok, content ~2500 tok
}

TESTS = [
    {
        "label": "Bowie (qwen3:1.7b) — domanda in italiano",
        "model": "qwen3:1.7b",
        "lang": "it",
        "prompt": (
            "Ciao! Sono un motociclista e sto pianificando un viaggio sulle Dolomiti. "
            "Puoi darmi tre consigli pratici su cosa portare per un tour di tre giorni in montagna?"
        ),
    },
    {
        "label": "Bowie (qwen3:1.7b) — domanda in inglese (lingua diversa dall'italiano)",
        "model": "qwen3:1.7b",
        "lang": "en",
        "prompt": (
            "Hi! I'm a motorcycle rider planning a trip through the Alps. "
            "Can you give me three practical tips for staying safe on mountain roads?"
        ),
    },
    {
        "label": "Horus (qwen3:4b) — percorso breve in italiano",
        "model": "qwen3:4b",
        "lang": "it",
        # Short focused prompt: less to reason about → shorter thinking phase
        "prompt": (
            "Consiglia due strade panoramiche in Toscana per moto, con una frase di descrizione ciascuna."
        ),
    },
    {
        "label": "Horus (qwen3:4b) — domanda in spagnolo",
        "model": "qwen3:4b",
        "lang": "es",
        # Short focused prompt in Spanish
        "prompt": (
            "¿Cuál es la mejor ruta en moto por los Pirineos? Dame un consejo breve."
        ),
    },
]

# Reasoning-leak patterns that must NOT appear in visible content
REASONING_LEAK_PATTERNS = [
    r"\bokay[,\s]*(?:so|let|the|I)\b",
    r"\blet me (?:think|consider|address|analyze|break)\b",
    r"\bthe user (?:wants?|asks?|is asking|needs?|is looking)\b",
    r"\bI need to (?:provide|think|consider|address)\b",
    r"\bI should (?:provide|think|consider|address|focus)\b",
    r"\bl[''']utente (?:vuole|chiede|sta chiedendo|ha chiesto)\b",
    r"\bdevo (?:fornire|pensare|considerare|rispondere)\b",
    r"<think>",
    r"</think>",
]


def call_ollama_think(model, prompt):
    """Call Ollama /api/chat with think:true. Returns (content, thinking, elapsed_s)."""
    num_predict = MODEL_NUM_PREDICT.get(model, 1500)
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": True,
        "options": {
            "temperature": 0.3,
            "num_predict": num_predict,
        },
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read()
    elapsed = time.time() - t0

    data = json.loads(raw)
    msg = data.get("message", {})
    content = msg.get("content", "")
    thinking = msg.get("thinking", "")
    return content, thinking, elapsed


def is_valid_ending(ch):
    """True if ch is a valid sentence-ending character (includes emoji and variation selectors)."""
    if ch in ".!?»\"')":
        return True
    cat = unicodedata.category(ch)
    # So=other symbol, Sm=math symbol, Sk=modifier symbol, Mn=nonspacing mark
    # Mn covers U+FE0F (VARIATION SELECTOR-16) which trails emoji
    if cat in ("So", "Sm", "Sk", "Mn"):
        return True
    cp = ord(ch)
    if 0x1F300 <= cp <= 0x1FAFF:  # misc symbols, emoticons, transport, etc.
        return True
    if 0xFE00 <= cp <= 0xFE0F:   # variation selectors (emoji modifiers)
        return True
    return False


def check_truncation(content):
    stripped = content.strip()
    if not stripped:
        return True, "risposta vuota"
    if not is_valid_ending(stripped[-1]):
        return True, f"ultimo char: {repr(stripped[-1])}"
    return False, ""


def run_tests():
    print("=" * 70)
    print("Task #127 — Verifica think:true Bowie + Horus su ThinkCentre reale")
    print("=" * 70)
    sys.stdout.flush()

    overall_pass = True

    for t in TESTS:
        print(f"\n{'─' * 60}")
        print(f"TEST: {t['label']}")
        print(f"Modello: {t['model']} | Lingua: {t['lang']}")
        print(f"Prompt: {t['prompt'][:90]}...")
        sys.stdout.flush()

        try:
            content, thinking, elapsed = call_ollama_think(t["model"], t["prompt"])
        except Exception as e:
            print(f"  ERRORE: {e}")
            overall_pass = False
            sys.stdout.flush()
            continue

        print(f"  Tempo: {elapsed:.1f}s | content: {len(content)} chars | thinking: {len(thinking)} chars")
        sys.stdout.flush()

        issues = []

        # 1. Reasoning must go to side channel
        if len(thinking) < 50:
            issues.append(f"thinking troppo corto ({len(thinking)} chars) — think:true non ha funzionato")
        else:
            print(f"  OK  thinking nel canale separato ({len(thinking)} chars)")

        # 2. No raw think tags in content
        if "<think>" in content or "</think>" in content:
            issues.append("tag <think></think> nel content — ragionamento non separato")
        else:
            print("  OK  nessun tag <think> nel content visibile")

        # 3. No leaked reasoning meta-commentary
        leaks = [p for p in REASONING_LEAK_PATTERNS if re.search(p, content, re.IGNORECASE)]
        if leaks:
            issues.append(f"meta-commentary analitica nel content: {leaks}")
        else:
            print("  OK  nessun pattern analitico nel content")

        # 4. Content not empty / not truncated
        if len(content.strip()) < 100:
            issues.append(f"risposta troppo corta ({len(content)} chars)")
        else:
            print(f"  OK  risposta di lunghezza adeguata ({len(content)} chars)")

        truncated, trunc_reason = check_truncation(content)
        if truncated:
            issues.append(f"risposta troncata: {trunc_reason}")
        else:
            print("  OK  risposta completa (termina correttamente)")

        # 5. Language coherence (light heuristic)
        snippet = content[:200].lower()
        if t["lang"] == "it" and re.match(r"^(okay|sure|certainly|of course|here are|hello)", snippet):
            issues.append("risposta inizia con preamble in inglese invece che in italiano")
        elif t["lang"] == "en" and re.match(r"^(certo|certamente|ecco|ciao|salve)", snippet):
            issues.append("risposta inizia in italiano invece che in inglese")
        elif t["lang"] == "es":
            es_words = r"\b(la|el|los|las|en|por|para|con|del|que|puedo|puede|son|ruta)\b"
            if not re.search(es_words, content[:300].lower()):
                issues.append("risposta in spagnolo non contiene vocaboli spagnoli attesi")
            else:
                print("  OK  lingua risposta coerente con la lingua del messaggio")
        else:
            print("  OK  lingua risposta coerente con la lingua del messaggio")

        print(f"\n  CONTENT (prime 400 chars):\n  {repr(content[:400])}")

        if issues:
            print(f"\n  FALLITO:")
            for issue in issues:
                print(f"    - {issue}")
            overall_pass = False
        else:
            print(f"\n  SUPERATO")
        sys.stdout.flush()

    print(f"\n{'=' * 70}")
    if overall_pass:
        print("RISULTATO FINALE: TUTTI I TEST SUPERATI")
    else:
        print("RISULTATO FINALE: ALCUNI TEST FALLITI")
    print("=" * 70)
    sys.stdout.flush()

    if not overall_pass:
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
