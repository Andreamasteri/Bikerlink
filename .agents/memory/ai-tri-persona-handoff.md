---
name: AI tri-persona handoff (Bowie/Horus/Ares)
description: How BikerLink's three mutually-aware AIs are wired and where handoff is decided; the non-obvious gating constraint for Ares.
---

BikerLink ha tre AI coscienti l'una dell'altra, tutte raggiunte dalla chat di Bowie (entry point):
- **Bowie** — assistente in-app, provider OLLAMA_* (chain Ollama→cloud), tool calling ON.
- **Horus** — specialista percorsi, stesso provider Ollama ma modello OLLAMA_ROUTING_MODEL (default `bikerlink-routing`), advisory (NO tools).
- **Ares** — diagnostica tecnica, provider DEDICATO DIAG_OLLAMA_* (`server/lib/ares-client.ts`, /api/chat NDJSON), SOLO admin.

**Dove si decide l'handoff:** nel ROUTE (`server/routes/ai-assistant.ts`), non nell'agent. Questo è intenzionale: i test esistenti chiamano `runAssistantAgent` direttamente senza persona → default bowie → tools → restano verdi. Roster + classificatori in `server/ai/assistant/roster.ts` (deterministici, keyword-based, zero costo): `classifyRoutingIntent` (→Horus) e `parseAresInvocation` (→Ares).

**Gotcha critico (gating provider):** `hasAnyAiProvider()` considera SOLO i provider cloud + OLLAMA_URL, NON DIAG_OLLAMA_URL. Il precheck 503 "nessun provider" DEVE risolvere la persona PRIMA e saltare il blocco quando `persona === "ares"`, altrimenti un admin che chiama Ares con solo DIAG configurato becca un 503 invece del flusso Ares (che degrada con grazia se offline).

**Why:** senza questa eccezione, l'unica AI con provider separato sarebbe l'unica bloccabile dal gate pensato per le altre due.

**Difesa in profondità:** l'agent ricade su Bowie se riceve `persona="ares"` ma `opts.platform!=="admin"` — il route già gatekeepa, ma evita esposizione se qualcuno chiama l'agent direttamente.

**Coscienza reciproca:** `renderRosterBlock(selfId)` inietta il blocco "LE ALTRE AI" in OGNI system prompt (knowledge.ts: buildSystemPrompt/buildAdminSystemPrompt/buildHorusSystemPrompt/buildAresSystemPrompt).

**UI:** il server emette un SSE event `persona` (prima dei delta) + `persona` nel `done`; il client mostra un'etichetta col nome AI colorata (bowie→accent, horus→success, ares→warning).
