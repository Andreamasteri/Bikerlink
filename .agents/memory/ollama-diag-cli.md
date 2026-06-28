---
name: Ollama diagnostics CLI (PC dedicato)
description: Skill/script di triage AI che invia log+sorgenti boot a Ollama sul PC dedicato, separato dall'app.
---

# Ollama diagnostics CLI — diagnosi crash/boot

`npx tsx scripts/ollama-diagnose.ts` raccoglie log (/tmp/server-crash.log, /tmp/backend.log,
logs/backend-crashes.log, logs/error-monitor.log, logs/cerbero.log) + sorgenti boot
(server/index.ts, boot-sequence.ts, init-state.ts) e li POSTa a `${DIAG_OLLAMA_URL}/api/chat`
(HTTP diretta, NON via Express → funziona a server giù). Report in logs/ai-diagnosis-*.md (gitignored).

**Why:** triage rapido di crash/boot senza leggere i log a mano; il PC dedicato è separato dal
ThinkCentre per non interferire con l'app in produzione.

**How to apply:**
- Secret distinti dall'app: `DIAG_OLLAMA_URL` (obbligatorio), `DIAG_OLLAMA_MODEL` (default
  `qwen2.5-coder:32b`), `DIAG_OLLAMA_TOKEN` (opz). NON sono `OLLAMA_URL`/`OLLAMA_MODEL` (quelli
  puntano al ThinkCentre per la catena AI dell'app).
- System prompt = `.agents/skills/ollama-diagnostics/bikerlink-context.md`, letto a runtime
  (aggiornalo lì quando cambia il boot, niente deploy). File da raccogliere configurabili in cima
  allo script (LOG_FILES/SOURCE_FILES). Timeout 180s (il 32b su CPU impiega 2-5 min).
- Skill: `.agents/skills/ollama-diagnostics/SKILL.md` (trigger "diagnosi ollama").
