# Verifica completezza porting AI da BikerBlog → BikerLink (Task #21)

Verifica sistematica che il sistema AI multi-agente (Bowie/Horus/Ares/Quebracho,
tool-calling, streaming, memoria) sviluppato nel repo gemello **BikerBlog**
durante il fermo di BikerLink sia stato portato in **BikerLink**.

Metodo: confronto **codice ↔ codice** (clone read-only `.bikerblog-ref/` @ `edab6a4`),
usando `docs/ai-hub-parity-contract.md` (sezioni A–H) di BikerBlog come checklist.
Ogni candidato è stato validato contro il codice BikerLink reale + le decisioni
già registrate in `.agents/memory/*.md` — **non** contro i changelog.

Nota architetturale di fondo (intenzionale, da memoria): BikerLink usa il
**Vercel AI SDK `streamText`**, non il loop `chatRaw` manuale di BikerBlog; e una
catena provider **cloud-first** (Groq→Gemini→OpenAI, Ollama in coda). La parità
va giudicata per **effetto/comportamento**, non per identità di codice.

---

## Esito sintetico

- **1 gap di correttezza reale trovato e corretto** (con test di regressione): E1.
- Diversi candidati segnalati dagli explorer erano **falsi negativi** (già presenti)
  o **allucinazioni** (righe inesistenti): vedi sezione "Candidati smentiti".
- Le funzionalità mancanti restanti sono **decisioni di prodotto/architettura**
  (report only, non implementate in questo task).

---

## A) Tool-loop / selezione contestuale / sentinel / tool-call testuale

| Punto | Descrizione BikerBlog | Stato BikerLink | Note |
|---|---|---|---|
| A2 | Selezione contestuale dei tool per messaggio | ✅ Presente | `tool-calling.ts` `selectToolNamesForMessage` |
| A3 | Sentinel `[TOOL_MANCANTE: nome]` + 1 retry con set completo | ✅ Presente | `agent.ts` gate `mode==="sentinel"` → retry |
| A4 | Cap dimensione risultato tool | ✅ Presente | `tools.ts` `MAX_TOOL_RESULT_CHARS=4000`, `capToolResult` (wired a `execute`). **Falso negativo dell'explorer.** |
| A5 | Fallback tool-call scritta come TESTO | ✅ Presente | `tryParseTextualToolCall` + gate `mode==="toolcall"` |
| A6 | `truncateReply` (cap lunghezza risposta, allentato se tool usato) | ⚠️ Diverso, non un bug | BikerLink usa `maxTokens`/`num_predict`. Meccanismo diverso ma valido → **report only** |

## B) Timeout / errori provider / probe

| Punto | Descrizione | Stato | Note |
|---|---|---|---|
| B1 | `isGatewayTimeoutError` (rileva 502/524 gateway) | ➖ Assente ma coperto | Simbolo **inesistente** in BikerLink (l'explorer aveva allucinato le righe). Un errore Ollama viene comunque intercettato dal `catch` e scala alla catena cloud → il gateway-timeout non degrada l'esperienza. **Report only** |
| B4 | `buildRequestFailedMessage` (riscrive HTML gateway in messaggio IT) | ➖ Assente ma coperto | Idem: l'HTML grezzo del gateway non raggiunge mai l'utente (SDK `throw` → `catch` → cloud/`⚠️` in italiano). **Report only** |
| B (cache) | Chiave cache sha256, TTL, stream:true, keep_alive numerico, num_predict, header CF-Access | ✅ Presente | `reply-cache.ts`, `ollama-client.ts` |
| F6 | Probe su `/api/version` (6s) vs `/api/tags` (2.5s) | ⚠️ Diverso, intenzionale | BikerLink ha **rimosso** il probe pre-stream per latenza (usa `isThinkCentreOffline()`), vedi `agent.ts`. **Report only** |

## C) Reply cache

| Punto | Stato | Note |
|---|---|---|
| Cache retry idempotente post-drop di rete | ✅ Presente | `reply-cache.ts` + route (Task #11). Cap 200 entry (vs 50 BikerBlog) = differenza minore |

## D) Eventi SSE / abort

| Punto | Descrizione | Stato | Note |
|---|---|---|---|
| D1/D2 | Header SSE + heartbeat 15s | ✅ Presente | `sse-heartbeat.ts` |
| D3 | Emissione `tool_call`/`tool_result` come eventi SSE dedicati | ➖ Assente | BikerLink emette solo `delta/action/done/error/persona`. UI-coherence: richiederebbe modifica client coordinata → **report only** |
| D4 | Flag `recoverable` sull'evento `error` (per UI "Riprova") | ➖ Assente | Il client (`lib/ai-assistant/sse-client.ts`) non ramifica su `recoverable`; aggiungerlo solo lato server sarebbe inerte. Richiede feature client → **report only** |
| **E1** | **Abort su `res.on("close")`, MAI `req.on("close")`** | ❌→✅ **CORRETTO** | Vedi sotto |
| E2/E3 | Propagazione `abortSignal` allo stream | ✅ Presente | `agent.ts` `abortSignal: opts.signal` |

### E1 — Bug reale corretto (streaming resilience)

**Sintomo:** `server/routes/ai-assistant.ts` e `server/routes/admin/ai-console.ts`
agganciavano l'abort a `req.on("close")`. Su **Node 20 + `express.json()`** la
`IncomingMessage` (`req`) emette `"close"` appena il body della POST è consumato
dal middleware — **prima** che l'handler di streaming arrivi al punto di aggancio
(dopo vari `await` di config/persona/contesto). `"close"` è **one-shot**: un
listener agganciato dopo che l'evento è già scattato **non viene mai chiamato**.

Conseguenza: l'abort su disconnessione del client era **morto** → alla chiusura
dell'app/tab il server **continuava a generare e a scrivere su un socket già
chiuso**, sprecando compute e quota Ollama/cloud. (E, in un timing sfortunato,
avrebbe potuto abortire il turno prima del primo token.)

**Verifica empirica** (Node v20.20.0, `server/__tests__/ai-assistant-abort-on-disconnect.test.ts`):
- Completamento normale: `req.on("close")` scatta **in anticipo** (al parse del body);
  `res.on("close")` **no**.
- Disconnessione reale con listener agganciato dopo un tick: `req.on("close")`
  **perde** l'evento; `res.on("close")` scatta correttamente.

**Fix:** `res.on("close", () => abort.abort())` nelle due route AI in streaming.
`res` emette `"close"` solo alla reale chiusura della risposta → segnale corretto,
mai prematuro. Corrisponde esattamente al fix E1 del contratto di parità BikerBlog.

**Nota di scope:** lo stesso pattern `req.on("close")` esiste in altre route NON-AI
(`chat/stream.ts`, `auth/login.ts`, `radio/playback.ts`, `planned-routes/waypoints.ts`,
`admin/diagnostics-stream.ts`, `admin/translations.ts`). Fuori dallo scope di questo
task (porting AI) e a rischio regressione se toccate alla cieca → **non modificate**,
segnalate come follow-up.

## Ares / Quebracho / Nadir / VRAM

| Capacità | Stato | Note |
|---|---|---|
| Ares (streaming, num_predict, CF-Access, composizione domanda) | ✅ Presente | `ares-client.ts`, `ares-question.ts` |
| VRAM arbiter (evict/restore per Ares) | ✅ Presente | `lib/vram-arbiter.ts` `withAresVramPriority` |
| Quebracho coordinatore (client dedicato, gate) | ✅ Presente | `quebracho-*.ts` |
| Fallback cloud per Ares/Quebracho | ➖ Assente **per scelta** | Da memoria (`quebracho-coordinator-gate`, `ai-tri-persona-handoff`): Ares degrada con grazia, Quebracho no cloud. **Non un gap** |
| **Nadir** — ricerca semantica manuale (`search_manual`), reindex, alert staleness-streak | ✅ Presente (Task #75) | `server/ai/nadir/*`, tool `search_manual` (Bowie/Horus nativo, Quebracho via injection pre-composizione), job notturno `jobs/nadir-nightly.ts`, pannello `app/admin/nadir.tsx`. **Divergenza deliberata:** riusa la pipeline embedding+HNSW locale invece di un servizio TC standalone `all-minilm` (vedi `nadir/constants.ts`) |
| `check_vram_usage` tool + iniezione warning congestione nel prompt + isteresi | ➖ Assente (parziale: c'è l'arbiter, non il tool/prompt) | **Feature, report only** |
| `coder-alert` | ➖ Assente | **Feature, report only** |
| Tool agente: `remember_note`, `save_file`/`read_file`/`list_files`, `call_[agent]` delega, `typecheck`/`lint`/`sonar`/`search_code`/`git_log`/`architect` | ➖ Assente | BikerLink usa bridge + admin-actions. **Decisioni di architettura/prodotto, report only** |

---

## Candidati smentiti (falsi allarmi degli explorer)

- **A4** (cap risultato tool) — dichiarato MANCANTE, in realtà **presente** (`tools.ts:51`).
- **B1/B4** (`isGatewayTimeoutError`/`buildRequestFailedMessage`) — dichiarati
  "definiti ma non chiamati" con riferimenti di riga precisi; in realtà **non
  esistono affatto** nel codice BikerLink (righe allucinate). L'esito pratico è
  comunque coperto dall'architettura cloud-first.

## Cosa NON è stato possibile verificare

- Comportamento **end-to-end su device reale** dell'abort su disconnessione
  (chiusura app mobile a metà stream): verificato per **semantica Node** e via
  **test di regressione**, non con un client mobile fisico.
- Parità di **contenuto** dei system prompt / RAG (fuori scope: si sono
  confrontate le capacità, non i testi dei prompt, che sono prodotto-specifici).
- Il clone BikerBlog è a `edab6a4`: modifiche AI più recenti nel repo gemello
  non presenti in quel commit non sono coperte.

---

## Modifiche apportate in questo task

- `server/routes/ai-assistant.ts` — abort su `res.on("close")` (era `req`).
- `server/routes/admin/ai-console.ts` — idem.
- `server/__tests__/ai-assistant-abort-on-disconnect.test.ts` — test di
  regressione (semantica Node res-vs-req + guardia sulle route reali).

Validazione: server typecheck ✅, lint ✅, suite AI assistant (43 test) ✅.
