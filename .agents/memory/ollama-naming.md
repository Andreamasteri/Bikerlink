---
name: Ollama instance naming (Ares / Bowie / Horus)
description: Nomi propri delle tre istanze Ollama di BikerLink e mappa nome→secret→ruolo→Modelfile. I secret SONO rinominati per-persona (Task #5256).
---

# Istanze Ollama BikerLink — Ares / Bowie / Horus

Tre istanze Ollama distinte, ciascuna con un nome proprio per disambiguare doc, log,
Modelfile **e i secret/env var**. Le env var Ollama sono rinominate per-persona
(prefisso `BOWIE_` / `HORUS_` / `ARES_`), così il nome dice subito quale istanza usa.

| Nome  | Env var                                   | Host        | Ruolo |
|-------|-------------------------------------------|-------------|-------|
| **Ares**  | `ARES_OLLAMA_URL/TOKEN/MODEL`         | PC fisso (Windows + GPU) | Diagnosi crash/boot, studio codebase, generazione manuale Q&A. Chiamata HTTP diretta (no Express), CF Access via `DIAG_OLLAMA_CF_CLIENT_ID/SECRET`. |
| **Bowie** | `BOWIE_OLLAMA_URL/TOKEN/MODEL`        | ThinkCentre | Assistente in-app / chat utente. Client condiviso `server/lib/ollama-client.ts`. |
| **Horus** | `HORUS_OLLAMA_MODEL` (host/token Bowie) | ThinkCentre (stesso di Bowie) | AI routing / analisi percorsi moto. Solo model id: NON fa HTTP diretta, usa il client Bowie. |

**Why:** prima i secret condivisi (`OLLAMA_*` per Bowie+Horus, `DIAG_OLLAMA_*` per Ares)
erano ambigui e la vecchia convenzione diceva "i secret NON si rinominano". Task #5256 ha
**superato** quella regola: ora ogni persona ha env var dedicate auto-esplicative.

**IMPORTANTE — CF Access invariato:** `DIAG_OLLAMA_CF_CLIENT_ID` e
`DIAG_OLLAMA_CF_CLIENT_SECRET` (Cloudflare Access service token di Ares) **restano col
prefisso `DIAG_`** — non sono stati rinominati (sono il token CF, non l'endpoint Ollama).

**How to apply:**
- Lettura runtime: `BOWIE_OLLAMA_*` = Bowie; `HORUS_OLLAMA_MODEL` = Horus (host/token =
  quelli di Bowie); `ARES_OLLAMA_*` = Ares. Default modelli: Bowie `mistral-nemo:latest`
  (fallback `llama3.1:8b`), Ares `qwen3-coder:30b`, Horus `bikerlink-routing`.
- Tutte le letture URL applicano `.trim()` prima di `.replace(/\/$/,"")` (difesa whitespace).
- TC-side **non** rinominato (concetto separato): la var input locale `OLLAMA_TOKEN` di
  `scripts/setup-ollama-server.sh` (token nginx), l'header HTTP `X-Ollama-Token`,
  `infra/self-host/**` e `scripts/archive/**` restano sui nomi vecchi.
- Modelfile su disco: `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile` (assistente) e
  `BikerLink-Horus.Modelfile` (routing). Per Ares solo system prompt runtime.
- Negli output usa il prefisso `[Ares]`/`[Bowie]`/`[Horus]` invece dell'URL grezzo.
- Skill di riferimento: `.agents/skills/ollama-diagnostics/SKILL.md` (Ares) e
  `.agents/memory/ollama-diag-cli.md`; vincolo run live 35b CPU >120s → solo da terminale.

## Voci distinte Bowie vs Horus (tono, non logica)
- **Bowie** = simpatico, diretto, un po' impaziente, "spirito del girovago": risposte brevi/vivaci, dai del tu, niente preamboli.
- **Horus** = sontuoso, elegante, preciso, sornione/da buongustaio: curato e dettagliato quando spiega una scelta di percorso, conciso quando basta.
- **Dove vive la voce**: Bowie ha DUE sorgenti che vanno tenute allineate — il `SYSTEM` del `BikerLink-Bowie.Modelfile` (fallback baked) E `buildSystemPrompt()` in `server/ai/assistant/knowledge.ts` (il prompt runtime che guida DAVVERO le risposte in-app). Horus ha SOLO il `SYSTEM` del `BikerLink-Horus.Modelfile`: **non esiste un flusso server-side di routing rivolto all'utente** (il modello `bikerlink-routing` compare solo in script/Modelfile). `buildAdminSystemPrompt()` (Bowie admin) è stato lasciato tecnico/diretto di proposito.
- **Why**: rendere percepibile all'utente che svolgono compiti diversi senza toccare la logica di routing/chat né le regole di sicurezza/azioni.
- Esempio affiancato (stessa domanda "Mi consigli un giro?"): Bowie → "Certo! Dimmi zona e quanti km, e ti sparo un giro su misura." · Horus → "Con piacere: indicami area e chilometraggio e ti comporrò un itinerario di curve scelte, con qualche panoramica che vale la deviazione."
