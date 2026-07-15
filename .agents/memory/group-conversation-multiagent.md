---
name: Multi-agent group conversation (turn-taking)
description: Design constraints for the observable Horus/Bowie/Quebracho round-table feature
---

# Conversazione osservabile a più agenti (tavola rotonda)

Motore turn-taking: l'admin propone un argomento e Bowie/Horus/Quebracho
discutono a turni, in streaming SSE, con transcript persistito e ripresa.

## Regole durature

- **Prompt APERTURA vs RISPOSTA sono separati per necessità, non per stile.**
  Il primo turno (turnIndex 0) riceve un prompt di apertura che dice
  esplicitamente "nessun altro ha ancora parlato". I turni successivi ricevono
  la storia dei turni precedenti.
  **Why:** senza questa distinzione il modello ALLUCINA le battute degli altri
  agenti a turni mai avvenuti.

- **La storia dei turni precedenti va passata come UN SOLO messaggio `user`**,
  non come ruoli `assistant` multipli.
  **Why:** più assistant-turn confondono il modello locale (qwen3/llama/granite)
  facendogli credere di dover continuare la voce altrui; un unico blocco
  "LA DISCUSSIONE FINORA: [Nome]: …" mantiene ogni agente nella propria voce.

- **`turnCount` = numero di turni PERSISTITI = fonte di verità per la ripresa.**
  Un turno interrotto a metà non viene scritto, quindi la ripresa riparte da
  `turnIndex = numero turni già salvati` e lo rigenera. Stati: `running`
  (in corso O interrotto/riprendibile), `completed` (raggiunto maxTurns),
  `aborted` (stop admin, NON riprendibile).

- **`surface` su ai_call_logs**: `"group"` per i turni di tavola rotonda,
  `"direct"`/NULL per la chat 1:1. Serve a distinguere le due superfici nel
  monitoraggio AI admin (breakdown `bySurface` in /api/admin/ai/metrics).

- **Ares è ESCLUSO dalla tavola rotonda** (per scelta del documento di
  riferimento): resta l'analisi asincrona invocata a parte. Partecipanti
  ammessi solo bowie/horus/quebracho.

- **Quebracho non usa il Vercel AI SDK** (come Ares): HTTP diretta via
  `streamQuebrachoChat` (che vuole `messages`, non `message`). Bowie/Horus
  passano da `streamText` + `getOllamaModel`; Horus richiede `think:false`.
