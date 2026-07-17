---
name: BikerBlog/TC AI agent ecosystem
description: Mappa completa degli agenti AI del sistema BikerBlog + ThinkCentre — modelli, ruoli, vincoli, VRAM budget. Fonte di verità per qualsiasi lavoro su agenti/pipeline/tool.
---

## 🧠 Horus — Il Narratore
- **Modello**: qwen3:4b (2.5 GB, GPU TC)
- **Tag Ollama**: `qwen3:4b` (diretto, non Modelfile)
- **Env BikerBlog**: `HORUS_OLLAMA_MODEL=qwen3:4b`
- **Env BikerLink**: `HORUS_OLLAMA_MODEL` → tag `bikerlink-routing:latest` (alias qwen3:4b, creato 2026-07-17)
- **Carattere**: agente editoriale principale; scrive in prima persona come motociclista; tono caldo e riflessivo; conosce BikerLink in profondità (feature, strade, problemi tecnici)
- **Compiti**:
  - Diary notturni (legge commit/task → narrazione italiana in stile diario personale)
  - Traduzioni IT→EN per audience internazionale
  - Recap settimanali narrativi
  - Chat web SSE (`/api/horus/chat`) con tool: ricerca web, GitHub, blog, note persistenti, analisi codice
  - Chat CLI (`pnpm --filter @workspace/scripts run horus:chat`)
- **Vincoli tecnici**:
  - `stream: true` obbligatorio (tunnel CF chiude connessioni idle dopo ~100s)
  - `think: false` obbligatorio (Qwen3 lascia content vuoto senza)
  - `keep_alive: -1` (risiede sempre in VRAM)

## 🎵 Bowie — Il Compagno Leggero
- **Modello**: qwen3:1.7b (1.4 GB, GPU TC)
- **Tag Ollama BikerBlog**: `qwen3:1.7b` (diretto)
- **Tag Ollama BikerLink**: `bikerlink:latest` (Modelfile wrapper su qwen3:1.7b)
- **Carattere**: veloce e agile, meno profondo di Horus; ideale per turni brevi e dialogo multi-agente; reattivo
- **Compiti**:
  - Chat di gruppo (sessioni multi-agente Horus+Bowie+Quebracho, turni alternati)
  - Risposte leggere, conferme, commenti rapidi
  - AI Assistant BikerLink (assistente principale utenti via `bikerlink:latest`)
- **NON fa**: diary, traduzioni, generazione lunga
- **Vincoli**: stesse regole stream/think/keep_alive di Horus

## 🐕 Quebracho — Il Supervisore Critico
- **Modello**: granite4:tiny-h (4.2 GB, **CPU+RAM** — intenzionalmente fuori GPU)
- **Motivo CPU**: non compete con Horus/Bowie/Nadir per VRAM — scelta architetturale permanente
- **Carattere**: "quality manager" severo ma giusto; terzo membro fondazione (utente + Replit Agent + Quebracho)
- **Compiti**:
  - Supervisione qualità notturna: campiona `llm_traces`, giudica anomalie (lingua sbagliata, CoT leak, risposte vuote)
  - Escalation al Coder se anomalie critiche + chat inattiva (gate: idle ≥ `CODER_MIN_IDLE_MS`)
  - Terza voce nelle sessioni multi-agente
- **Fallback**: provider cloud (solo testo, senza parità tool) se TC non raggiungibile

## 🔭 Nadir — Il Bibliotecario Semantico
- **Modello**: all-minilm:latest (45 MB, GPU TC)
- **Tipo**: embedding-only — NON genera testo, NON ha conversazioni, NON ha memoria propria
- **Compiti**:
  - Calcola vettori semantici dei post blog
  - Alimenta tool `search_manual` usabile da Horus/Bowie (ricerca per significato, non keyword)
- **È pura infrastruttura**: silenzioso e preciso; aggiungere alla whitelist db-integrity se si toccano le dimensioni vettori

## ⚔️ Ares — L'Analista Pesante (on-demand)
- **Modello**: devstral:latest (14 GB, GPU TC — **NON residente**)
- **Trigger**: `POST /_internal/ares/analyze` (admin only)
- **Carattere**: potente ma lento (55–170s cold-load); "Ares propone, l'admin decide" — invariante assoluto
- **Compiti**:
  - Analisi backlog anomalie da Quebracho → propone ~2 percorsi di risoluzione
  - **Proposta only**: non applica mai nulla autonomamente
- **Attivazione**: evicta Horus/Bowie/Quebracho dalla GPU → gira → ripristina sempre nel `finally`
- **Gate**: non parte se chat attiva; slot condiviso con Coder (stesso modello + lock `isAresRunning()`)

## 💻 Coder — Il Programmatore Pesante (on-demand)
- **Modello**: devstral:latest (stesso slot di Ares)
- **Lock**: `isCoderRunning()` è alias di `isAresRunning()` — non possono girare in parallelo
- **Trigger**: `POST /_internal/coder/analyze` · escalation automatica da Quebracho
- **Compiti**:
  - Analisi codebase profonda per problemi che i modelli leggeri non identificano
  - Escalation da Quebracho con gate: chat inattiva + idle ≥ `CODER_MIN_IDLE_MS`
  - Ripristino lineup con rollback temporizzato (`CODER_RESTORE_TIMEOUT_MS`, default 60s); fallback fallisce → alert in chat

## 🗺️ BikerLink Horus (contesto separato)
- **Modello**: qwen3:4b via tag `bikerlink-routing:latest` su TC
- **Progetto**: BikerLink (non BikerBlog) — gestisce routing AI dell'assistant
- Stessa infrastruttura TC, tag separato per isolamento dei Modelfile

---

## Budget VRAM (8 GB GPU totali)

| Agente | Memoria | Dove |
|--------|---------|------|
| Horus | 2.5 GB | GPU |
| Bowie | 1.4 GB | GPU |
| Nadir | 0.05 GB | GPU |
| margine | ~0.05 GB | — |
| **Totale residente** | **~4 GB** | GPU |
| Quebracho | 4.2 GB | **CPU** |
| Ares/Coder | 14 GB | GPU on-demand (evicta tutto) |

**Why:** 8 GB GPU sono al limite con i soli residenti. Quebracho su CPU è deliberato. Ares/Coder non coesistono mai con la lineup — pattern obbligatorio: evict → run → restore nel `finally`.

**How to apply:** Prima di aggiungere qualsiasi modello alla lineup residente, verificare che il budget GPU regga. Modelli >4 GB vanno sempre on-demand con pattern evict+restore. Non alzare `OLLAMA_MAX_LOADED_MODELS` senza ricalcolare il budget.

---

## Invarianti tecnici (mai derogare)

1. `stream: true` per tutte le chiamate con output lungo (CF tunnel timeout idle 100s)
2. `think: false` per tutti i modelli qwen3 in modalità non-streaming/JSON (content vuoto altrimenti)
3. `keep_alive: -1` per i residenti (Horus/Bowie/Nadir); Ares/Coder escono dalla VRAM dopo ogni job
4. **"Ares propone, l'admin decide"** — Ares/Coder non applicano mai nulla autonomamente
5. Quebracho su CPU — non spostare in GPU senza riprogettare il budget
6. Coder/Ares condividono slot: `isCoderRunning()` = `isAresRunning()`, mai far partire entrambi
7. Bowie BikerLink (`bikerlink:latest`) ≠ Bowie BikerBlog (`qwen3:1.7b`) — tag e contesti separati

---

## Schema infrastruttura

```
Replit (BikerBlog)          TC (server fisico, 8 GB GPU)
│                           │
├─ api-server ──────────────┤── Cloudflare Tunnel ──── Horus (qwen3:4b)       GPU residente
├─ scripts/pipeline ────────┤                     ├─── Bowie (qwen3:1.7b)      GPU residente
└─ horus lib (@workspace) ──┘                     ├─── Nadir (all-minilm)      GPU residente
                                                  ├─── Quebracho (granite4)    CPU residente
                                                  ├─── Ares/Coder (devstral)   GPU on-demand
                                                  ├─── bikerlink:latest        GPU [BikerLink Bowie]
                                                  └─── bikerlink-routing       GPU [BikerLink Horus]
```
