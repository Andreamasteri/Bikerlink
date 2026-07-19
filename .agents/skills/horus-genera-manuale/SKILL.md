---
name: horus-genera-manuale
description: >
  Guida completa per eseguire l'intera pipeline di generazione del manuale utente BikerLink:
  Horus scansiona il codice → TC salva → Nadir indicizza → Bowie/Horus ricevono il manuale
  aggiornato nel proprio system prompt.
  Usa questa skill quando l'utente scrive: "genera il manuale", "aggiorna il manuale",
  "crea il manuale utente", "manuale app", "horus scrivi il manuale",
  "aggiorna bowie col manuale", "push manuale bowie", "push manuale horus",
  "manuale bikerlink", "fai generare il manuale a horus", "rebuilda il manuale",
  "aggiorna la documentazione utente", "pipeline manuale".
  Contiene comandi curl precisi, tabelle storage/secret, 24 aree funzionali,
  vincoli operativi e tabella errori comuni. Autonomamente eseguibile senza
  cercare nulla nel codebase.
---

# Skill: Pipeline Manuale Horus → Nadir → Bowie/Horus

## Prerequisito: carica `.agents/skills/ai-agent-access/SKILL.md`

Prima di qualsiasi chiamata diretta a Horus o ai servizi TC, leggi la skill `ai-agent-access`:

```bash
source scripts/ai-agent-access.sh
```

Quella skill contiene: tabella secret, tabella errori CF, funzioni `ai_check_tc` / `ai_call_horus` / `ai_call_tc_agent`.

### Distinzione critica: `stream:false` vs `stream:true`

| Endpoint | `stream` | Motivo |
|----------|----------|--------|
| `POST /api/create` (Ollama — crea/aggiorna modello) | `false` | Operazione idempotente di creazione, non una chat — non ha token da stremare; il timeout è gestito dall'applicazione |
| `POST /api/chat` (Ollama — chiamata chat/inferenza) | **`true` obbligatorio** | CF Cloudflare taglia connessioni silenziose dopo ~100s (524); `stream:true` mantiene viva la connessione dal primo token |

> ⚠️ **Non usare mai `stream:false` con `/api/chat` dietro CF tunnel** — si ottiene HTTP 524 dopo ~100s.

### Ordine canonico per le chiamate Horus dirette

```bash
source scripts/ai-agent-access.sh

# 1. Verifica secret
echo "$HORUS_OLLAMA_URL" | wc -c        # > 5
echo "$HORUS_OLLAMA_TOKEN" | wc -c      # > 5
echo "$CF_ACCESS_CLIENT_ID" | wc -c     # > 5

# 2. Verifica TC online
STATUS=$(ai_check_tc)
[ "$STATUS" = "online" ] || { echo "TC $STATUS"; exit 1; }

# 3. Chiamata (usa ai_call_horus per /api/chat — stream:true, strip think, max-time 180)
RESPONSE=$(ai_call_horus "Il tuo prompt qui")
echo "$RESPONSE"
```

---

Questa skill documenta l'intera pipeline di generazione del manuale utente BikerLink
e guida l'esecuzione di ogni step. È completa e autonomamente eseguibile.

---

## Panoramica Pipeline

```
Step 1: Horus scan mode=manual  (POST /api/admin/horus-scan/start)
  └─ legge ~2000 file, produce note funzionali + lessicali per-file
  └─ durata: 20–45 min cold, 5–15 min warm (fingerprint cache sui file invariati)
  └─ batch da 4 file, tick ogni 1.5s, cede alla routing-AI se occupata

Step 2: Finalizzazione  (automatica, dentro la scan)
  └─ Horus scrive 24 sezioni funzionali + dizionario interfaccia + panoramica + glossario
  └─ Salva su Replit:  AppSetting "nadir_manual_text"  (sorgente di verità)
  └─ Salva su TC:      ~/agent-shared/nadir/manuale/{lang}.md  (via ai-hub, best-effort)
  └─ Mirror locale:    logs/nadir-manual-latest.md  +  logs/nadir-manual-{ts}.md

Step 3: Nadir indicizza  (automatico a fine scan, dentro retranslateManualNow)
  └─ reindexNadir("manual") → embed multilingue → pgvector/HNSW
  └─ Bowie usa searchNadir per RAG già da questo momento
  └─ traduzioni in 6 lingue (en/de/fr/es/el/tr) generate via Horus

Step 4: Polling fino a done  (GET /api/admin/horus-scan/status ogni 30s)
  └─ leggi scans.manual.phase: idle → scanning → finalizing → done | error

Step 5: Push manuale → Bowie  (script, opzionale ma raccomandato)
  └─ npx tsx scripts/ollama-push-manual.ts
  └─ Inietta manuale nel SYSTEM prompt del modello bikerlink-assistant su TC
  └─ Legge il manuale da docs/bikerlink-qa-manual.md (o --qa-file <path>)
  └─ Chiama POST {BOWIE_OLLAMA_URL}/api/create (stream:false)
  └─ Su successo: riscrive scripts/ollama-modelfile/BikerLink-Bowie.Modelfile

Step 6: Push manuale → Horus  (script, opzionale)
  └─ npx tsx scripts/ollama-push-manual.ts --target horus
  └─ Inietta manuale nel SYSTEM prompt del modello bikerlink-routing su TC
  └─ Modelfile: scripts/ollama-modelfile/BikerLink-Horus.Modelfile
  └─ Auto-detect: --model-name bikerlink-routing seleziona Horus automaticamente

Step 7: Genera PDF  (opzionale)
  └─ node scripts/generate-manual-pdf.mjs
  └─ Legge manuale-utente-bikerlink.md → output: manuale-utente-bikerlink-aprile2026.pdf
  └─ Copia in server/public/bikerlink-manual.pdf
```

---

## Step 1 — Avvio Scansione Manuale

**Endpoint:** `POST /api/admin/horus-scan/start`

```bash
# Avvia la scansione manuale (richiede cookie di sessione admin)
curl -s -X POST https://<REPLIT_DEV_DOMAIN>/api/admin/horus-scan/start \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<SESSION_COOKIE>" \
  -d '{"mode":"manual"}'
```

**Risposta attesa (avvio riuscito):**
```json
{
  "success": true,
  "data": {
    "started": true,
    "reason": null,
    "status": {
      "mode": "manual",
      "status": "running",
      "startedAt": 1720000000000,
      "filesTotal": 1987,
      "filesAnalyzed": 0,
      "filesSkipped": 0,
      "filesPending": 1987
    }
  }
}
```

**Risposta se già in corso:**
```json
{ "success": false, "error": "scansione già in corso" }
```
→ Oppure `started: false, reason: "scansione già in corso"` dentro `data`.

**Risposta se Ollama irraggiungibile:**
```json
{ "data": { "started": false, "reason": "Horus (Ollama) non raggiungibile — riprova quando il ThinkCentre è online" } }
```

---

## Step 4 — Polling Stato

**Endpoint:** `GET /api/admin/horus-scan/status`

```bash
# Polling ogni 30s fino a status completed/error
curl -s https://<REPLIT_DEV_DOMAIN>/api/admin/horus-scan/status \
  -H "Cookie: session=<SESSION_COOKIE>"
```

**Campi chiave nella risposta:**
```json
{
  "data": {
    "scans": {
      "manual": {
        "status": "running",          // idle | running | completed | interrupted | error
        "filesTotal": 1987,
        "filesAnalyzed": 420,
        "filesSkipped": 310,          // file invariati (fingerprint cache)
        "filesPending": 1257,
        "lastFile": "app/screens/MapScreen.tsx",
        "lastError": null,
        "resultSummary": null         // popolato solo a fine scan
      }
    },
    "manual": {
      "length": 87432,                // lunghezza manuale corrente in AppSetting
      "hasPrevious": true,
      "previousSavedAt": "2026-07-10T14:22:00.000Z"
    }
  }
}
```

**Lettura manuale corrente:**
```bash
GET /api/admin/nadir/manual
# → { "data": { "text": "...", "translations": [...] } }
```

---

## TC Storage Paths

| Lingua | Path TC (agent-shared) | AppSetting Key (Replit) | Mirror locale |
|--------|------------------------|-------------------------|---------------|
| Italiano (sorgente) | `~/agent-shared/nadir/manuale/it.md` | `nadir_manual_text` | `logs/nadir-manual-latest.md` |
| Italiano (ultimo) | `~/agent-shared/nadir/manuale/latest.md` | — | `logs/nadir-manual-{ts}.md` |
| Inglese | `~/agent-shared/nadir/manuale/en.md` | `nadir_manual_translations` (key `en`) | — |
| Tedesco | `~/agent-shared/nadir/manuale/de.md` | `nadir_manual_translations` (key `de`) | — |
| Francese | `~/agent-shared/nadir/manuale/fr.md` | `nadir_manual_translations` (key `fr`) | — |
| Spagnolo | `~/agent-shared/nadir/manuale/es.md` | `nadir_manual_translations` (key `es`) | — |
| Greco | `~/agent-shared/nadir/manuale/el.md` | `nadir_manual_translations` (key `el`) | — |
| Turco | `~/agent-shared/nadir/manuale/tr.md` | `nadir_manual_translations` (key `tr`) | — |

**Nota:** il salvataggio TC è best-effort via `ai-hub POST /files/write`. Se ai-hub è offline,
il manuale viene salvato solo su Replit (`nadir_manual_text`). La prossima scan sincronizzerà
automaticamente il TC appena ai-hub torna disponibile.

Il backup della versione precedente è in AppSetting `nadir_manual_previous_text`.

---

## Vincoli Operativi

| Vincolo | Dettaglio |
|---------|-----------|
| Solo on-demand | La scan NON parte mai da un timer. Solo da trigger esplicito (API o chat admin). |
| Single-flight per modalità | Una sola scan `manual` alla volta. La risposta `started: false` indica che è già in corso. |
| Fingerprinting | File invariati dall'ultima scan (hash SHA-256) vengono saltati. `filesSkipped` ne conta il numero. |
| Interruzione pulita se Ollama giù | La scan si ferma con `status: interrupted`, il progresso è salvato. Una nuova scan riprende dai file non ancora analizzati. |
| Durata tipica | 20–45 min cold (tutto il codebase), 5–15 min warm (solo file modificati). |
| Auth obbligatoria | Tutti gli endpoint /api/admin/* richiedono sessione admin attiva. |
| Multilingua automatica | Le 6 lingue (en/de/fr/es/el/tr) vengono tradotte da `retranslateManualNow` automaticamente a fine scan. |
| Reindex automatico | `reindexNadir("manual")` è chiamato dentro `retranslateManualNow` — non serve lanciarlo a mano. |
| Cede alla routing-AI | Se `isRoutingAiBusy()` è true, il tick corrente viene posticipato di 8s senza perdere il batch. |
| Modello usato | `HORUS_OLLAMA_MODEL` (env/secret), default dal registry `AGENT_MODEL_DEFAULTS.horus`. |

---

## 24 Aree Funzionali del Manuale

Le sezioni vengono generate nell'ordine seguente (`MANUAL_AREAS` in `horus-manual-areas.ts`):

1. Mappa Live e Visibilità Rider
2. Routing Moto — Pianificazione Percorsi
3. Navigazione in Tempo Reale
4. Tracking GPS e Sessioni di Guida
5. Telemetria e Calibrazione Sensori
6. MotoClub — Gestione Club
7. Matching tra Rider
8. Proposte e Richieste di Giro
9. Eventi Motociclistici
10. SOS e Segnalazione Pericoli Stradali
11. Contest Foto
12. Arcade e Gamification
13. Chat e Messaggistica
14. Profilo Utente e Garage
15. Assistente AI Bowie
16. Horus — AI di Routing e Analisi Codice
17. Nadir — Ricerca Semantica e RAG
18. Ares — Diagnostica Tecnica (solo admin)
19. Horus — Coordinamento Job AI
20. Watchdog, Monitoraggio e Alert
21. Sistema OTA e Aggiornamenti App
22. ThinkCentre e Infrastruttura Self-Hosted
23. Autenticazione, Ruoli e Admin Panel
24. Notifiche Push, Localizzazione e Multi-Lingua

Seguono: **Dizionario dell'Interfaccia — Schermata per Schermata** (dalle note lessicali UI)
e **Glossario** con 35 termini tecnici.

---

## File Chiave del Codebase

| File | Ruolo |
|------|-------|
| `server/ai/assistant/horus-scanner.ts` | Loop principale scan, `startHorusScan()`, `getHorusScanStatus()`, prompt per-file funzionale e lessicale |
| `server/ai/assistant/horus-scanner-finalize-manual.ts` | `finalizeManualScan()`: assembla panoramica → 24 sezioni → dizionario interfaccia → glossario, salva TC+Replit+mirror |
| `server/ai/assistant/horus-manual-areas.ts` | `MANUAL_AREAS` (24 aree con domande), `GLOSSARY_TERMS` (35 termini) |
| `server/ai/assistant/codebase-inventory.ts` | `computePending()`, `readAndHashFile()`, `saveFileScanStore()`, `loadI18nDictionary()`, `isLexiconEligible()` |
| `server/ai/nadir/manual.ts` | Storage manuale: `saveNadirManualWithBackup()`, `getNadirManual()`, `getNadirManualTranslations()`, `chunkManual()` |
| `server/ai/nadir/translate.ts` | `retranslateManualNow()` → traduzione 6 lingue + reindexNadir |
| `server/ai/nadir/index.ts` | `reindexNadir("manual")`, `searchNadir()` |
| `server/lib/ai-hub-client.ts` | `hubPost("/files/write", ...)`, `isHubAvailable()` |
| `server/routes/admin/horus-scan.ts` | `POST /api/admin/horus-scan/start`, `GET /api/admin/horus-scan/status` |
| `server/routes/admin/nadir.ts` | `GET /api/admin/nadir/manual`, `PUT /api/admin/nadir/manual`, `POST /api/admin/nadir/reindex` |
| `scripts/ollama-push-manual.ts` | Push Q&A nel modello Bowie (e Horus) su TC via `POST {URL}/api/create` |
| `scripts/generate-manual-pdf.mjs` | Genera PDF dal file `manuale-utente-bikerlink.md` |
| `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile` | Modelfile del modello `bikerlink-assistant` (Bowie) |
| `scripts/ollama-modelfile/BikerLink-Horus.Modelfile` | Modelfile del modello `bikerlink-routing` (Horus) |

---

## Secret e Env Necessari

| Secret/Env | Usato da | Obbligatorio |
|------------|----------|--------------|
| `HORUS_OLLAMA_URL` | `horus-scanner.ts` → `callOllamaChat(persona:"horus")` | ✅ Sì |
| `HORUS_OLLAMA_TOKEN` | Auth nginx verso Ollama ThinkCentre | ✅ Sì |
| `HORUS_OLLAMA_MODEL` | Modello qwen3:4b (default da `AGENT_MODEL_DEFAULTS.horus`) | ⚠️ Raccomandato |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access Service Token (tutte le chiamate TC) | ✅ Sì |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access Service Token | ✅ Sì |
| `AI_HUB_URL` | `ai-hub-client.ts` → salvataggio TC files | ✅ Per storage TC |
| `AI_HUB_GATE_TOKEN` | Auth ai-hub | ✅ Per storage TC |
| `BOWIE_OLLAMA_URL` | `ollama-push-manual.ts` Step 5 | ✅ Per push Bowie |
| `BOWIE_OLLAMA_TOKEN` | Auth nginx Bowie su TC | ⚠️ Se richiesto da nginx |

---

## Step 5 — Push Manuale a Bowie (Script)

```bash
# Uso standard: inietta docs/bikerlink-qa-manual.md nel modello bikerlink-assistant
npx tsx scripts/ollama-push-manual.ts

# Dry run: mostra il Modelfile risultante senza inviare né scrivere
npx tsx scripts/ollama-push-manual.ts --dry-run

# Specifica un file Q&A diverso
npx tsx scripts/ollama-push-manual.ts --qa-file logs/nadir-manual-latest.md

# Specifica un nome modello diverso
npx tsx scripts/ollama-push-manual.ts --model-name bikerlink-assistant
```

**Cosa fa lo script:**
1. Legge `docs/bikerlink-qa-manual.md` (o il file specificato via `--qa-file`)
2. Legge `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile`
3. Inietta il Q&A nel blocco `SYSTEM """..."""` tra i marker `=== INIZIO MANUALE UTENTE Q&A ===` / `=== FINE MANUALE UTENTE Q&A ===`
4. Chiama `POST {BOWIE_OLLAMA_URL}/api/create` con `{name, modelfile, stream: false}`
5. **Solo se il push ha successo:** sovrascrive `BikerLink-Bowie.Modelfile` su disco

**Auth:** `cfAccessHeaders()` (Cloudflare Access) + `BOWIE_OLLAMA_TOKEN` come `Authorization: Bearer` + `X-Ollama-Token`.

---

## Step 6 — Push Manuale a Horus (Script)

```bash
# Uso standard con flag --target horus
npx tsx scripts/ollama-push-manual.ts --target horus

# Dry run: mostra il Modelfile Horus risultante senza inviare né scrivere
npx tsx scripts/ollama-push-manual.ts --target horus --dry-run

# Specifica un file Q&A diverso
npx tsx scripts/ollama-push-manual.ts --target horus --qa-file logs/nadir-manual-latest.md

# Auto-detect: passare --model-name bikerlink-routing seleziona Horus automaticamente
npx tsx scripts/ollama-push-manual.ts --model-name bikerlink-routing
```

**Cosa fa lo script con `--target horus`:**
1. Legge `docs/bikerlink-qa-manual.md` (o il file specificato via `--qa-file`)
2. Legge `scripts/ollama-modelfile/BikerLink-Horus.Modelfile` (NON Bowie)
3. Inietta il Q&A nel blocco `SYSTEM """..."""` tra i marker `=== INIZIO MANUALE UTENTE Q&A ===` / `=== FINE MANUALE UTENTE Q&A ===`
4. Chiama `POST {BOWIE_OLLAMA_URL}/api/create` con `{name: "bikerlink-routing", modelfile, stream: false}`
5. **Solo se il push ha successo:** sovrascrive `BikerLink-Horus.Modelfile` su disco (mai `BikerLink-Bowie.Modelfile`)

**Selezione target — priorità:**
1. `--target bowie|horus` — esplicito, vince sempre
2. `--model-name bikerlink-routing` — auto-detect → horus
3. Default (nessun flag) → bowie

---

## Step 7 — Genera PDF (Opzionale)

```bash
# Prerequisito: manuale-utente-bikerlink.md deve esistere nella root del repo
node scripts/generate-manual-pdf.mjs
```

**Output:**
- `manuale-utente-bikerlink-aprile2026.pdf` (nella root)
- `server/public/bikerlink-manual.pdf` (copia per il server)

Il PDF include: copertina arancione BikerLink, indice automatico, 24 capitoli,
piè di pagina con numero pagina, pagina finale con branding.

---

## Errori Comuni

| Errore / Sintomo | Causa | Soluzione |
|-----------------|-------|-----------|
| `started: false, reason: "scansione già in corso"` | Scan manual già running (single-flight) | Aspetta che finisca (polling) oppure leggi lo stato con GET /status |
| `status: "error"` + Ollama giù | `isOllamaReachable("horus")` ha fallito durante la finalizzazione | Riavvia Ollama sul TC (`systemctl restart ollama` o via thinkcentre-access skill), poi rilancia la scan |
| `status: "interrupted"` a metà | Horus non raggiungibile durante la scan | Il progresso è salvato. Rilancia: i file già analizzati verranno saltati (fingerprint cache). |
| Timeout scan (>45 min senza progresso) | Ollama lentissimo o GC/swap su TC | Rilancia dopo aver verificato il ThinkCentre. File già analizzati conservati. |
| ai-hub offline durante salvataggio TC | `isHubAvailable()` → false | Non fatale: il manuale è già su Replit (`nadir_manual_text`). La prossima scan sincronizzerà il TC automaticamente. |
| Push Bowie/Horus `exit 1` | ThinkCentre spento, Cloudflare Tunnel giù, o token errato | Nessuna modifica locale. Controlla `BOWIE_OLLAMA_URL`, Tunnel e token. Usa `--dry-run` per testare il Modelfile senza inviare. |
| Traduzioni `mancanti: el, tr` | Ollama timeout durante la traduzione di lingue rare | Non bloccante: Bowie usa l'italiano come fallback per quelle lingue. Rilancia `POST /api/admin/nadir/manual/translations/el/retranslate` per singola lingua. |
| Push Bowie: `Blocco SYSTEM non trovato` | Il Modelfile è stato editato a mano e manca `SYSTEM """..."""` | Ripristina il blocco SYSTEM nel Modelfile prima di rilanciare. |
| `filesSkipped` pari a `filesTotal` | Tutti i file sono già stati analizzati nell'ultima scan (nessuna modifica) | Horus finalizza subito con lo store esistente. Normale dopo scan ravvicinate. |

---

## Flusso Agente — Esecuzione Rapida

Quando l'utente dice **"genera il manuale"** o trigger equivalente:

1. **Verifica Ollama:** `GET /api/admin/horus-scan/status` → controlla se già running.
2. **Avvia scan:** `POST /api/admin/horus-scan/start {"mode":"manual"}` → conferma `started: true`.
3. **Informa l'utente:** durata stimata 20–45 min cold, 5–15 min warm; progresso automatico.
4. **Polling opzionale:** ogni 30s `GET /status` → riporta `filesAnalyzed/filesTotal`.
5. **A scan completata** (`status: "completed"`): leggi `resultSummary` e riporta all'utente.
6. **Push Bowie** (se richiesto): `npx tsx scripts/ollama-push-manual.ts`.
7. **Push Horus** (se richiesto): vedi Step 6.
8. **PDF** (se richiesto): `node scripts/generate-manual-pdf.mjs`.
