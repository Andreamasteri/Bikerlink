---
name: Ollama instance naming (Ares / Bowie / Horus)
description: Nomi propri delle tre istanze Ollama di BikerLink e mappa nome→secret→ruolo→Modelfile; i secret NON si rinominano.
---

# Istanze Ollama BikerLink — Ares / Bowie / Horus

Tre istanze Ollama distinte, ciascuna con un nome proprio per disambiguare doc, log e
Modelfile. **I secret NON cambiano nome**: i nomi propri vivono solo in documentazione,
output dei comandi e file `*.Modelfile`.

| Nome  | Secret        | Host        | Ruolo |
|-------|---------------|-------------|-------|
| **Ares**  | `DIAG_OLLAMA_*` | PC fisso (Windows + GPU) | Diagnosi crash/boot, studio codebase, generazione manuale Q&A. |
| **Bowie** | `OLLAMA_*`      | ThinkCentre | Assistente in-app / chat utente dentro l'app. |
| **Horus** | `OLLAMA_*`      | ThinkCentre (stesso di Bowie) | AI routing / analisi percorsi moto. |

**Why:** prima c'erano riferimenti ambigui ("PC dedicato", "Ollama del ThinkCentre",
"assistant") che si confondevano tra loro; i nomi propri rendono inequivocabile quale
istanza fa cosa in skill, memory, script e log.

**How to apply:**
- Mappa secret→nome (NON rinominare i secret): `DIAG_OLLAMA_URL/MODEL/TOKEN` = **Ares**;
  `OLLAMA_URL/MODEL/TOKEN` = **Bowie** (assistente) o **Horus** (routing), stesso host TC,
  distinti dal modello/uso a runtime, non da secret separati.
- Modelfile su disco: `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile` (assistente,
  modello `bikerlink-assistant`, usato da `ollama-push-manual.ts`) e
  `BikerLink-Horus.Modelfile` (routing, modello `bikerlink-routing`). Per Ares c'è solo
  il system prompt runtime (`bikerlink-context.md`), eventuale `bikerlink-diag` opzionale.
- Negli output dei comandi usa il prefisso `[Ares]`/`[Bowie]`/`[Horus]` invece dell'URL
  grezzo per capire al volo quale istanza è coinvolta.
- Skill di riferimento: `.agents/skills/ollama-diagnostics/SKILL.md` (Ares) e
  `.agents/memory/ollama-diag-cli.md`; vincolo run live 35b CPU >120s → solo da terminale.

## Voci distinte Bowie vs Horus (tono, non logica)
- **Bowie** = simpatico, diretto, un po' impaziente, "spirito del girovago": risposte brevi/vivaci, dai del tu, niente preamboli.
- **Horus** = sontuoso, elegante, preciso, sornione/da buongustaio: curato e dettagliato quando spiega una scelta di percorso, conciso quando basta.
- **Dove vive la voce**: Bowie ha DUE sorgenti che vanno tenute allineate — il `SYSTEM` del `BikerLink-Bowie.Modelfile` (fallback baked) E `buildSystemPrompt()` in `server/ai/assistant/knowledge.ts` (il prompt runtime che guida DAVVERO le risposte in-app). Horus ha SOLO il `SYSTEM` del `BikerLink-Horus.Modelfile`: **non esiste un flusso server-side di routing rivolto all'utente** (il modello `bikerlink-routing` compare solo in script/Modelfile). `buildAdminSystemPrompt()` (Bowie admin) è stato lasciato tecnico/diretto di proposito.
- **Why**: rendere percepibile all'utente che svolgono compiti diversi senza toccare la logica di routing/chat né le regole di sicurezza/azioni.
- Esempio affiancato (stessa domanda "Mi consigli un giro?"): Bowie → "Certo! Dimmi zona e quanti km, e ti sparo un giro su misura." · Horus → "Con piacere: indicami area e chilometraggio e ti comporrò un itinerario di curve scelte, con qualche panoramica che vale la deviazione."
