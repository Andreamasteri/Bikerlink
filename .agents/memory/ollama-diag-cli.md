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

## Studio completo — `scripts/ollama-study-repo.ts`

Script separato (NON è la diagnosi crash): fa STUDIARE a Ollama l'intera codebase +
dump dei due DB e produce `logs/repo-study-<ts>.md`, poi inietta la sezione
`## Architettura` in `bikerlink-context.md` tra i marker `AUTO-ARCHITETTURA` (idempotente).

**Why:** dare a Ollama una conoscenza completa e persistente del progetto (codice +
schema + dati reali + drift dev↔prod) per diagnosi future più profonde.

**How to apply:**
- Scarica i sorgenti da GitHub via `git/trees?recursive=1` + `contents` (base64),
  token `DIAG_GITHUB_TOKEN` con fallback `GITHUB_TOKEN`; filtra `.ts/.tsx/.sql` + JSON
  rilevanti, esclude node_modules/.expo/dist/assets/logs e file > 100 KB.
- Dump DB con lib `pg` diretta (sola lettura): `DATABASE_URL` (dev) + `PROD_DATABASE_URL`
  (prod, env AGGIUNTIVA rispetto alla diagnosi). Schema SEMPRE intero, dati troncati a
  `MAX_DB_CHARS` (200k char) con tabelle piccole prioritarie; DB giù → `[non disponibile]`.
- Chunk codice ~480k char rispettando i confini di file; invio sequenziale a
  `${DIAG_OLLAMA_URL}/api/chat` (timeout 300s/chunk) + `cfAccessHeaders()`.
- Flag: `--dry-run` (lista file), `--no-db`, `--branch`, `--max-files`, `--chunk-chars`.
- È lungo (2000+ file): per prove rapide usa `--max-files N` / `--no-db` / `--dry-run`.
