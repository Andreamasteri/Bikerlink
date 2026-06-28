---
name: ollama-diagnostics
description: Diagnosi AI di crash/boot di BikerLink. Raccoglie log + file chiave del boot e li invia via HTTP diretta a Ollama sul PC dedicato (modello coder 32b). Usa quando l'utente dice "diagnosi ollama", "analizza i log con ollama", o quando l'app crasha/non parte e serve un triage automatico senza leggere i log a mano.
---

# Ollama Diagnostics — Diagnosi AI con PC dedicato

Skill che fa il triage automatico dei problemi di avvio/crash del backend BikerLink.
Lo script raccoglie i log e i file sorgente chiave del boot, li impacchetta con un
system prompt che descrive l'architettura BikerLink, e li invia al **PC dedicato**
(Windows + GPU) che esegue Ollama con un modello coder (default `qwen2.5-coder:32b`).

La chiamata è **HTTP diretta** all'endpoint Ollama (`${DIAG_OLLAMA_URL}/api/chat`):
NON passa dal backend Express, quindi **funziona anche quando il server è giù**.

## Quando usarla

- L'utente scrive "diagnosi ollama" / "analizza i log con ollama".
- L'app crasha, va in crash-loop, o non completa il boot e serve capire perché.
- Vuoi un'analisi dei punti deboli del codice di boot senza leggere i log manualmente.

## Come lanciarla

```bash
npx tsx scripts/ollama-diagnose.ts
# più righe di log per ogni file:
npx tsx scripts/ollama-diagnose.ts --tail 500
```

Lo script:
1. Legge i log (`/tmp/server-crash.log`, `/tmp/backend.log`, `logs/backend-crashes.log`,
   `logs/error-monitor.log`, `logs/cerbero.log`) prendendo le ultime ~300 righe ciascuno.
2. Legge i file chiave del boot (`server/index.ts`, `server/boot-sequence.ts`,
   `server/init-state.ts`), troncati per non saturare il context window.
3. Carica il system prompt da `bikerlink-context.md` (in questa cartella).
4. Invia tutto a `${DIAG_OLLAMA_URL}/api/chat` (timeout 180s — il 32b su CPU/RAM
   impiega 2-5 minuti).
5. Stampa il report a console e lo salva in `logs/ai-diagnosis-<timestamp>.md`.

I file da raccogliere sono configurabili in cima a `scripts/ollama-diagnose.ts`
(`LOG_FILES`, `SOURCE_FILES`, `DEFAULT_TAIL_LINES`, `MAX_SOURCE_CHARS`).

## Secret / variabili d'ambiente

| Variabile           | Obbligatoria | Default              | Note |
|---------------------|--------------|----------------------|------|
| `DIAG_OLLAMA_URL`   | sì           | —                    | URL base dell'Ollama sul PC dedicato (via Cloudflare Tunnel), es. `https://diag.example.com`. **Distinto** da `OLLAMA_URL` usato dall'app (che punta al ThinkCentre). |
| `DIAG_OLLAMA_MODEL` | no           | `qwen2.5-coder:32b`  | Può puntare a un modello custom da Modelfile (es. `bikerlink-diag`). |
| `DIAG_OLLAMA_TOKEN` | no           | —                    | Bearer token se l'endpoint è protetto. |

Per impostare i secret: usa la skill `environment-secrets` (mai scriverli a mano nei file).

### Modello custom (opzionale)

Si può creare sul PC dedicato un modello custom derivato da `qwen2.5-coder:32b` con il
system prompt BikerLink già cucito dentro, e puntarci `DIAG_OLLAMA_MODEL`. Riferimento
Modelfile esistente: `scripts/ollama-modelfile/BikerLink.Modelfile` (quello è per
l'assistant dell'app; per la diagnosi se ne può fare uno analogo `bikerlink-diag`).
Lo script invia comunque il system prompt, quindi il modello custom serve solo a
rafforzare il contesto, non è necessario.

## Come interpretare l'output

Il report è strutturato in tre sezioni:
- **## Problemi trovati** — i sintomi concreti rilevati nei log.
- **## Causa probabile** — la spiegazione più plausibile.
- **## Azione suggerita** — i passi per risolvere.

È un **suggerimento AI**, non una verità assoluta: verifica sempre contro il codice e
i log reali prima di agire. Il report resta salvato in `logs/ai-diagnosis-*.md`
(ignorato da git).

## Se l'endpoint non risponde

Se il PC è spento o il Cloudflare Tunnel è giù, lo script lo dice chiaramente
(host irraggiungibile / timeout) ed esce con codice 1 senza bloccarsi. Verifica che
il PC dedicato sia acceso, Ollama in esecuzione e l'hostname in `DIAG_OLLAMA_URL`
raggiungibile.

## Manutenzione

Quando cambia l'architettura del boot o emergono nuovi punti critici, aggiorna
**`bikerlink-context.md`** (il system prompt) in questa cartella. Lo script lo legge a
runtime: nessun deploy necessario. Per aggiungere/togliere file dal contesto, modifica
gli array di configurazione in cima a `scripts/ollama-diagnose.ts`.

## Out of scope

- Nessun trigger automatico: solo esecuzione manuale o su richiesta.
- Nessuna modifica all'app Expo o al backend Express.
- Il setup del PC Windows/Ollama/Cloudflare Tunnel è manuale (lato utente); la skill
  assume l'endpoint già raggiungibile.
