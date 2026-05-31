---
name: deploy-logging
description: Sistema di logging deploy/boot a 4 fasi di BikerLink — rende i build log del pannello Publish e i log runtime di produzione auto-esplicativi. Usa questa skill quando devi leggere/diagnosticare un deploy fallito, aggiungere o modificare log nel deploy-build o nel boot del server, o replicare lo stesso schema di logging altrove.
---

# Deploy / Boot Logging a 4 fasi

Schema di logging condiviso che mappa l'intero ciclo di publish in **4 fasi**
numerate, così chi legge i log sa sempre QUALE fase sta guardando e CHI la logga.

## La mappa delle 4 fasi

| Fase | Chi la esegue | Chi la logga | Cosa fa |
|------|---------------|--------------|---------|
| **1/4** | piattaforma Replit | Replit (pannello Publish) | security scan · copia dev→prod DB · install pacchetti |
| **2/4** | `scripts/deploy-build.sh` | **noi** | pulizia workspace + build server TypeScript |
| **3/4** | piattaforma Replit | Replit (pannello Publish) | Creating image · Pushing Repl layer · Creating Autoscale |
| **4/4** | runtime (container) | **noi** (`server/index.ts`) | avvio container + migrazioni DB |

Le fasi 1 e 3 le logga Replit; le fasi 2 e 4 le logghiamo noi. Se un deploy
fallisce, capire in quale fase è morto è il primo passo della diagnosi.

## FASE 2/4 — `scripts/deploy-build.sh`

Due helper di logging in cima allo script:

```bash
# log()  → riga con timestamp UTC: si vede QUANDO succede ogni step.
# size() → dimensione di una dir (vuota/assente → "-"): si vede quanto pesa e
#          quanto libera ogni pulizia (metrica chiave per il limite ~2 GB del layer).
log()  { echo "[deploy $(date -u '+%H:%M:%SZ')] $*"; }
size() { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }
```

Convenzioni:
- All'inizio stampa il **banner con la mappa delle 4 fasi** e marca `▶ FASE 2/4 ... ◀ SEI QUI`.
- Ogni step di pulizia/build è marcato `=== [N/3] descrizione ===` e logga la
  `size()` PRIMA e DOPO, così si vede esattamente quanto spazio libera.
- Alla fine ristampa la `size()` totale del workspace che entra nel Repl layer e
  anticipa cosa vedrà l'utente nelle fasi 3 e 4.
- `set -e` è attivo: un comando che fallisce ferma il deploy. (Vedi memory
  `deploy-build-cache.md`: NON fare `rm` su `.cache/`.)

## FASE 4/4 — `server/index.ts`

Funzione `bootLog` con timestamp + secondi trascorsi dall'inizio del boot:

```ts
const BOOT_START = Date.now();
function bootLog(n: number, total: number, step: string, msg: string) {
  const elapsed = ((Date.now() - BOOT_START) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] [${n}/${total}] ${step} — ${elapsed}s | ${msg}`);
}
```

Convenzioni:
- All'avvio stampa un banner `════════ FASE 4/4 DEPLOY — Runtime: avvio container ════════`.
- Il boot è diviso in `TOTAL = 5` step interni, ognuno loggato `start` e `done`:
  1. **HTTP Listen** — bind `0.0.0.0:$PORT` (health ritorna 503 finché il boot non finisce)
  2. **Migrations** — `server/migrate.ts` applica i file `migrations/*.sql`
  3. **DB Init**
  4. **Seed + Engine**
  5. **Schedulers**
- Output di esempio: `[2026-05-31T09:40:12.345Z] [2/5] Migrations — 1.3s | start`

## Come usarla

- **Diagnosi deploy fallito**: individua in quale FASE si è fermato. Fasi 1/3 →
  log nel pannello Publish di Replit (usa anche il tool deployment logs). Fasi 2/4
  → i nostri log (`[deploy ...]` per la 2, `[.../5]` / `[migrate]` per la 4).
- **Aggiungere uno step di build**: in `deploy-build.sh` usa `log` + `size`,
  rinumera i marker `[N/3]` e logga size prima/dopo.
- **Aggiungere uno step di boot**: in `server/index.ts` aumenta `TOTAL` e chiama
  `bootLog(n, TOTAL, "Nome", "start")` / `"done"` attorno al nuovo step.
- **Replicare altrove**: copia gli helper `log`/`size` (shell) o `bootLog` (TS) e
  mantieni il formato `[N/total] Step — elapsed | msg` per coerenza.
