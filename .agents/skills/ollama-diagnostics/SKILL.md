---
name: ollama-diagnostics
description: Diagnosi AI di crash/boot di BikerLink. Raccoglie log + file chiave del boot e li invia via HTTP diretta ad Ares (Ollama PC fisso, secret DIAG_OLLAMA_*, modello coder 32b). Usa quando l'utente dice "diagnosi ollama", "analizza i log con ollama", o quando l'app crasha/non parte e serve un triage automatico senza leggere i log a mano.
---

# Ollama Diagnostics — Diagnosi AI con ARES (PC fisso)

> **Nomi delle istanze Ollama** (vedi `.agents/memory/ollama-naming.md`):
> - **Ares** = `DIAG_OLLAMA_*` — PC fisso (Windows + GPU): diagnosi, studio codebase,
>   generazione del manuale Q&A. È l'istanza usata da QUESTA skill.
> - **Bowie** = `OLLAMA_*` — ThinkCentre: assistente in-app / chat utente.
> - **Horus** = `OLLAMA_*` — stesso ThinkCentre: AI routing / analisi percorsi.
>
> I **secret NON cambiano nome** (`DIAG_OLLAMA_*` resta Ares, `OLLAMA_*` resta
> Bowie/Horus). I nomi propri servono solo nei doc, nei log e nei Modelfile.

Skill che fa il triage automatico dei problemi di avvio/crash del backend BikerLink.
Lo script raccoglie i log e i file sorgente chiave del boot, li impacchetta con un
system prompt che descrive l'architettura BikerLink, e li invia ad **Ares** (PC fisso
Windows + GPU) che esegue Ollama con un modello coder (default `qwen2.5-coder:32b`).

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
| `DIAG_OLLAMA_URL`   | sì           | —                    | URL base di Ares (Ollama PC fisso) via Cloudflare Tunnel, es. `https://diag.example.com`. **Distinto** da `OLLAMA_URL` usato dall'app (Bowie/Horus sul ThinkCentre). |
| `DIAG_OLLAMA_MODEL` | no           | `qwen2.5-coder:32b`  | Può puntare a un modello custom da Modelfile (es. `bikerlink-diag`). |
| `DIAG_OLLAMA_TOKEN` | no           | —                    | Bearer token se l'endpoint è protetto. |

Per impostare i secret: usa la skill `environment-secrets` (mai scriverli a mano nei file).

### Modello custom (opzionale)

Si può creare su Ares un modello custom derivato da `qwen2.5-coder:32b` con il
system prompt BikerLink già cucito dentro, e puntarci `DIAG_OLLAMA_MODEL`. Riferimenti
Modelfile esistenti: `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile` (assistente
in-app, Bowie) e `scripts/ollama-modelfile/BikerLink-Horus.Modelfile` (AI routing,
Horus); per la diagnosi su Ares se ne può fare uno analogo `bikerlink-diag`.
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
Ares (PC fisso) sia acceso, Ollama in esecuzione e l'hostname in `DIAG_OLLAMA_URL`
raggiungibile.

## Manutenzione

Quando cambia l'architettura del boot o emergono nuovi punti critici, aggiorna
**`bikerlink-context.md`** (il system prompt) in questa cartella. Lo script lo legge a
runtime: nessun deploy necessario. Per aggiungere/togliere file dal contesto, modifica
gli array di configurazione in cima a `scripts/ollama-diagnose.ts`.

## Studio completo della codebase + DB (`ollama-study-repo.ts`)

Script separato e più ampio della diagnosi crash: fa STUDIARE a Ollama l'intera
codebase e il dump dei due database, producendo un report architetturale persistente.

```bash
npx tsx scripts/ollama-study-repo.ts
npx tsx scripts/ollama-study-repo.ts --dry-run          # lista file, niente invio
npx tsx scripts/ollama-study-repo.ts --no-db            # salta il dump dei DB
npx tsx scripts/ollama-study-repo.ts --branch develop   # altro branch
npx tsx scripts/ollama-study-repo.ts --max-files 800    # limita i file scaricati
npx tsx scripts/ollama-study-repo.ts --chunk-chars 360000
```

Cosa fa:
1. Scarica da GitHub (`DIAG_GITHUB_TOKEN`, fallback `GITHUB_TOKEN`) tutti i file
   `.ts/.tsx/.sql` + i `.json` rilevanti (esclude `node_modules`, `.expo`, `dist`,
   `assets`, `logs`, file > 100 KB), in batch paralleli (≤10).
2. Raggruppa i file in chunk (~480 000 char di default) rispettando i confini di file.
3. Fa il dump di **schema completo** (sempre intero) + **dati riga per riga** (troncati
   a `MAX_DB_CHARS` = 200 000 char, tabelle piccole prioritarie) di **dev** (`DATABASE_URL`)
   e **prod** (`PROD_DATABASE_URL`) — sola lettura. DB irraggiungibile → `[non disponibile: …]`.
4. Invia i chunk + il blocco DB in sequenza a `${DIAG_OLLAMA_URL}/api/chat` (timeout 300s/chunk),
   poi chiede un report finale strutturato.
5. Salva il report in `logs/repo-study-<timestamp>.md` e **inietta la sezione
   `## Architettura`** in `bikerlink-context.md` (tra i marker `AUTO-ARCHITETTURA`),
   così la diagnosi crash eredita la conoscenza dell'architettura.

Env aggiuntive rispetto alla diagnosi: `PROD_DATABASE_URL` (dump prod). Usa gli stessi
`DIAG_OLLAMA_URL/MODEL/TOKEN` e gli header Cloudflare Access (`cfAccessHeaders()`).

NB: è un'operazione lunga (la codebase è grande). Usa `--dry-run` per vedere cosa
verrebbe inviato, `--max-files`/`--no-db` per prove rapide.

## Manuale Q&A utente → Bowie (assistente in-app) (`ollama-push-manual.ts`)

Dopo la sintesi architetturale, `ollama-study-repo.ts` esegue un passo finale che
chiede ad **Ares** un **manuale utente in formato Q&A** (50-100 coppie `## D: …` /
`**R:** …`, punto di vista dell'utente finale) e lo salva in
**`docs/bikerlink-qa-manual.md`** (file tracciato da git). È uno step resumabile come
gli altri: con `--step` avanza una chiamata per volta dopo il report.

Un secondo script inietta quel manuale in **Bowie**, l'assistente in-app (l'Ollama del
**ThinkCentre**, non Ares che fa la diagnosi) creando/aggiornando il modello
custom `bikerlink-assistant` via API, senza SSH:

```bash
npx tsx scripts/ollama-push-manual.ts                       # inietta + push al ThinkCentre
npx tsx scripts/ollama-push-manual.ts --dry-run             # stampa il Modelfile, NON chiama, NON scrive
npx tsx scripts/ollama-push-manual.ts --model-name bikerlink-assistant
npx tsx scripts/ollama-push-manual.ts --qa-file docs/bikerlink-qa-manual.md
```

Cosa fa:
1. Legge `docs/bikerlink-qa-manual.md` e `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile`.
2. Inietta il Q&A come blocco `## MANUALE UTENTE Q&A` **dentro il SYSTEM prompt** del
   Modelfile, tra i marker `INIZIO/FINE MANUALE UTENTE Q&A` (sostituisce il blocco
   precedente se presente). Il contenuto è costruito **in memoria**.
3. `POST ${OLLAMA_URL}/api/create` con `{ name, modelfile, stream:false }`, timeout 120s,
   header **Cloudflare Access** (`cfAccessHeaders()`) + token custom `OLLAMA_TOKEN`
   (Bearer / `X-Ollama-Token`).
4. **Solo se il push riesce** scrive il Modelfile aggiornato su disco. Se il ThinkCentre
   è irraggiungibile o l'endpoint risponde con errore → exit 1 e **nessuna modifica** al
   Modelfile.

Poi punta l'assistente in-app al modello aggiornato: `OLLAMA_MODEL=bikerlink-assistant`
(secret Replit, via skill `environment-secrets`).

Env aggiuntive: `OLLAMA_URL` (ThinkCentre, **distinto** da `DIAG_OLLAMA_URL`),
`OLLAMA_TOKEN` (opz.). CF Access condiviso con gli altri servizi self-hosted.

## Out of scope

- Nessun trigger automatico: solo esecuzione manuale o su richiesta.
- Nessuna modifica all'app Expo o al backend Express.
- Nessun accesso in scrittura ai DB (lo studio è sola lettura).
- Nessun embedding o vector store: il contesto vive in `bikerlink-context.md`.
- Il setup del PC Windows/Ollama/Cloudflare Tunnel è manuale (lato utente); la skill
  assume l'endpoint già raggiungibile.
