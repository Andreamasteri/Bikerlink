---
name: horus-bowie-interrogation
description: >
  Avvia e monitora una sessione di interrogazione incrociata tra Horus e Bowie su BikerLink.
  Horus interroga Bowie sulle funzionalità dell'app; Bowie interroga Horus sull'infrastruttura;
  Horus analizza entrambi i log e produce un report strutturato (sezioni A/B/C).
  Usa questa skill quando l'utente scrive: "interroga bowie", "interroga horus",
  "interrogazione incrociata", "horus chiede a bowie", "bowie chiede a horus",
  "testa gli agenti", "quanto sa bowie", "quanto sa horus", "botta e risposta horus bowie",
  "valuta gli agenti", "report agenti", "horus valuta bowie", "esercitazione agenti".
  PREREQUISITO: eseguire prima la skill horus-genera-manuale (push manuale a Bowie e a Horus)
  altrimenti gli agenti rispondono senza contesto aggiornato dell'app.
---

# Skill: Interrogazione Incrociata Horus ↔ Bowie

## Prerequisito: carica `.agents/skills/ai-agent-access/SKILL.md`

Prima di qualsiasi chiamata a Horus o Bowie, leggi la skill `ai-agent-access` e sourcia lo script canonico:

```bash
source scripts/ai-agent-access.sh
```

Quella skill contiene: tabella secret, tabella errori CF, funzione `ai_check_tc`, note cold-load e strip reasoning inglese.

### Pre-flight obbligatorio (usa `ai_check_tc`)

```bash
source scripts/ai-agent-access.sh
STATUS=$(ai_check_tc)
echo "TC status: $STATUS"
if [ "$STATUS" != "online" ]; then
  echo "ERROR: TC non raggiungibile ($STATUS) — impossibile avviare l'interrogazione"
  exit 1
fi
```

> **Strip reasoning inglese**: `qwen3:4b` con `think:false` può far "trapelare" righe di reasoning in inglese (`Okay,`, `Sure,`, `Let me`) prima della risposta reale. Lo script `horus-bowie-interrogation.ts` applica il parser `_ai_parse_ndjson` (dallo script canonico) che rimuove automaticamente queste righe.

> **Cold-load**: `qwen3:4b` richiede ~125s a freddo. Il timeout per chiamata nello script è 4 min — non ridurlo.

---

Script standalone che fa interrogare Horus e Bowie a vicenda, poi produce un report leggibile.
Nessun server avviato, nessuna dipendenza DB: solo chiamate dirette agli endpoint Ollama sul ThinkCentre.

---

## Prerequisiti (eseguire nell'ordine)

Prima di lanciare la sessione, verificare che:

1. **Manuale generato** — `GET http://localhost:5000/api/admin/nadir/manual` restituisce testo non vuoto (lunghezza > 200 chars). Se vuoto: eseguire prima la skill `horus-genera-manuale`.

2. **Manuale pushato a Bowie** —
   ```bash
   npx tsx scripts/ollama-push-manual.ts --target bowie
   ```

3. **Manuale pushato a Horus** —
   ```bash
   npx tsx scripts/ollama-push-manual.ts --target horus
   ```

4. **Entrambi gli endpoint TC raggiungibili** — il preflight dello script verifica questo automaticamente prima di partire.

---

## Comandi

```bash
# Esecuzione base: 8 domande per lato, tutte e 3 le fasi
npx tsx scripts/horus-bowie-interrogation.ts

# Numero domande personalizzato
npx tsx scripts/horus-bowie-interrogation.ts --questions 12

# Dry-run: stampa i prompt senza chiamare nessun endpoint
npx tsx scripts/horus-bowie-interrogation.ts --dry-run

# Salta una fase e riprende dal log più recente in out-dir
npx tsx scripts/horus-bowie-interrogation.ts --skip-phase 1
npx tsx scripts/horus-bowie-interrogation.ts --skip-phase 3

# Directory output personalizzata
HORUS_LOG_DIR=/tmp npx tsx scripts/horus-bowie-interrogation.ts

# Combina flag
npx tsx scripts/horus-bowie-interrogation.ts --questions 5 --out-dir /tmp/interrog
```

**Nota `--skip-phase`:** lo script cerca automaticamente il file più recente con il suffisso corrispondente nella outDir (ordinamento lessicografico discendente del timestamp nel nome file). Se non esiste nessun file precedente, esce con un errore esplicito anziché procedere con log vuoti.

---

## Le 3 Fasi

### Fase 1 — Horus interroga Bowie (~10–20 min)

1. **Horus genera N domande** in modalità ragionamento (`callHorusReasoning`, numPredict=4000, temp 0.2) — domande concrete sull'app dal punto di vista utente: mappa live, routing curvy, tracking GPS, telemetria, matching, SOS, Bowie stesso.
2. **Horus riformula** ogni domanda in tono colloquiale (`callHorusChat`, numPredict=300).
3. **Bowie risponde** a ciascuna domanda (`callBowie`, numPredict=3000, temp 0.5).

Output: `logs/interrogation-{ts}-horus-asks-bowie.md`

### Fase 2 — Bowie interroga Horus (~10–20 min)

1. **Bowie genera N domande** in modalità chat (`callBowie`, numPredict=3000) — domande tecniche genuine: routing engines, GraphHopper vs Valhalla, scheduler AI, ThinkCentre, algoritmo di matching, cosa succede quando il TC va offline.
2. **Horus risponde** a ciascuna domanda (`callHorusChat`, numPredict=2500, temp 0.5).

Output: `logs/interrogation-{ts}-bowie-asks-horus.md`

### Fase 3 — Analisi e report (~5–10 min)

1. **Horus analizza** entrambi i log in modalità ragionamento (`callHorusReasoning`, numPredict=7000) — valutazione per risposta, lacune, autocritica, miglioramenti Modelfile.
2. **Horus scrive il report** finale in modalità chat (`callHorusChat`, numPredict=5000) — tono diretto e personale.

Output: `logs/interrogation-{ts}-report.md`

---

## Formato dei File Output

### `interrogation-{ts}-horus-asks-bowie.md`

```markdown
# Interrogazione: Horus chiede a Bowie

Data: 2026-07-15T14:32:00.000Z

---

## Domanda 1

**Come funziona il ghost mode sulla mappa live?**

Il ghost mode permette di nascondersi dalla mappa degli altri rider...

---

## Domanda 2

**Cosa succede se perdo il segnale GPS durante un percorso attivo?**

In caso di perdita segnale, l'app...
```

### `interrogation-{ts}-bowie-asks-horus.md`

```markdown
# Interrogazione: Bowie chiede a Horus

Data: 2026-07-15T14:55:00.000Z

---

## Domanda 1

**Come decide il sistema quale engine di routing usare per un percorso?**

La selezione dell'engine dipende dalla funzione richiesta...
```

### `interrogation-{ts}-report.md`

```markdown
# Report Interrogazione Incrociata Horus ↔ Bowie

Data: 2026-07-15T15:10:00.000Z
Domande per lato: 8

## A — Valutazione di Bowie

**Domanda 1** — Voto: 4/5
Risposta precisa sul ghost mode, ma mancava il dettaglio sul ripristino automatico...

**Domanda 2** — Voto: 3/5
...

## B — Autocritica di Horus

Ho risposto bene alle domande tecniche su GraphHopper, ma sulla gestione degli errori...

## C — Suggerimenti per i Modelfile

1. Aggiungere al SYSTEM prompt di Bowie un paragrafo su tracking offline...
2. Nel Modelfile di Horus, specificare meglio il fallback quando DragonflyDB è giù...
```

---

## Come Leggere il Report

Il **report** (`-report.md`) è il file più importante — leggerlo prima degli altri.

- **Sezione A** — Quanto Bowie sa già, per risposta. Voti bassi (1–2) = area da rinforzare nel manuale o nel Modelfile.
- **Sezione B** — Autocritica di Horus: spesso più onesta di quanto ci si aspetti. Identifica dove Horus è stato impreciso o superficiale.
- **Sezione C** — Azioni concrete: aggiungere sezioni al manuale, riformulare il SYSTEM prompt, rigenerare i modelli con `ollama-push-manual.ts`.

---

## Errori Comuni

| Errore / Sintomo | Causa | Soluzione |
|-----------------|-------|-----------|
| `Preflight fallito — ThinkCentre non raggiungibile` | TC spento o Cloudflare Tunnel giù | Verificare `HORUS_OLLAMA_URL` / `BOWIE_OLLAMA_URL`, controllare tunnel CF su dashboard |
| `Nessun file *-horus-asks-bowie.md trovato` | `--skip-phase 1` senza run precedente | Eseguire almeno una volta senza `--skip-phase`, poi usarlo |
| Fase 1 o 2 lenta (>30 min) | Normale a freddo con qwen3:4b su CPU/GPU limitata | Aspettare; il timeout è 4 min per chiamata, il warm-up può allungare il primo turno |
| `output vuoto dopo stripThink` | Horus o Bowie ha risposto solo con `<think>…</think>` senza content | Rilanciare la fase; problema intermittente su carico elevato |
| Parsing domande vuoto / fallback righe | Horus ha risposto in formato non numerato (`1. domanda`) | Il fallback righe prende le righe più lunghe — il risultato è spesso usabile; se no, rilanciare con `--skip-phase` sulle fasi precedenti |
| Fase 3 troncata a metà report | Budget token esaurito (numPredict=5000) | Normale con report molto lunghi; le sezioni A/B/C presenti sono comunque utili |
| `Manuale troppo corto (<200 chars)` | Manuale non ancora generato o vuoto | Eseguire la pipeline `horus-genera-manuale` prima di lanciare questo script |
| `Modelfile non trovato` durante push | Modelfile spostato o path errato | Verificare `scripts/ollama-modelfile/BikerLink-{Bowie,Horus}.Modelfile` |

---

## File Chiave

| File | Ruolo |
|------|-------|
| `scripts/horus-bowie-interrogation.ts` | Script principale — 3 fasi, fetch diretto Ollama |
| `scripts/ollama-push-manual.ts` | Push Q&A nel Modelfile di Bowie/Horus prima dell'interrogazione |
| `scripts/ollama-modelfile/BikerLink-Bowie.Modelfile` | Modelfile del modello `bikerlink-assistant` (Bowie) |
| `scripts/ollama-modelfile/BikerLink-Horus.Modelfile` | Modelfile del modello `bikerlink-routing` (Horus) |
| `.agents/skills/horus-genera-manuale/SKILL.md` | Prerequisito: genera e distribuisce il manuale |

---

## Secret Necessari

| Secret | Usato da | Obbligatorio |
|--------|----------|--------------|
| `HORUS_OLLAMA_URL` | Endpoint Horus su ThinkCentre | ✅ Sì |
| `HORUS_OLLAMA_TOKEN` | Auth Bearer verso nginx Horus | ✅ Sì |
| `HORUS_OLLAMA_MODEL` | Modello Horus (default: `qwen3:4b`) | ⚠️ Raccomandato |
| `BOWIE_OLLAMA_URL` | Endpoint Bowie su ThinkCentre | ✅ Sì |
| `BOWIE_OLLAMA_TOKEN` | Auth Bearer verso nginx Bowie | ✅ Sì |
| `BOWIE_OLLAMA_MODEL` | Modello Bowie (default: `qwen3:1.7b`) | ⚠️ Raccomandato |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access Service Token | ✅ Sì |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access Service Token | ✅ Sì |
