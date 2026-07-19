---
name: analisi-deploy-horus
description: Analisi completa dell'ultimo deploy BikerLink insieme a Horus dopo il completamento del deploy. Usare DOPO che il pannello Publish mostra "Deployment successful". Diagnosi di deploy lento, perché il deploy è lento, cosa ha rallentato il deploy, analizza le fasi 3 e 4, boot lento, creating autoscale lento, pushing repl layer lento, fase 3 lenta, fase 4 lenta, boot runtime lento, deploy completato cosa è successo. DA ESEGUIRE SOLO SU RICHIESTA ESPLICITA DELL'UTENTE — mai automaticamente.
---

# Analisi Deploy con Horus — Diagnosi post-deploy BikerLink

> **Quando usarla**: SOLO su richiesta esplicita dell'utente, dopo che il deploy è completato (pannello Publish mostra "Deployment successful" o è fallito). NON durante il deploy. NON avviarla automaticamente dopo ogni deploy. Le fasi 3 e 4 sono sistematicamente le più lente; questa skill dà una procedura strutturata per diagnosticarle.

> **Ruolo dell'agente**: raccogliere i dati, passarli a Horus, materializzare le proposte in task. L'agente **non decide** autonomamente cosa fixare — lo decide Horus.

## Mappa delle 4 fasi del deploy

| Fase | Chi la esegue | Cosa fa | Dove trovare i log |
|------|--------------|---------|-------------------|
| **FASE 1/4** | Piattaforma Replit | Security scan · copia dev→prod DB · install pacchetti | Pannello Publish (righe iniziali) |
| **FASE 2/4** | `scripts/deploy-build.sh` | 15 step: pulizie workspace + gate statici + build server TS | Pannello Publish (righe `[deploy HH:MM:SSZ]`) |
| **FASE 3/4** | Piattaforma Replit | Creating image · Pushing Repl layer · Pushing Repl (cache) layer · Creating Autoscale service · Waiting for service | Pannello Publish (righe piattaforma) — **sistematicamente lenta** |
| **FASE 4/4** | Runtime container | Avvio Express + migrate.ts + boot-sequence (5 step interni) | Log di produzione (`[boot]`, `[N/5]`, `[migrate]`) |

**Nota sistema bootLog**: `server/index.ts` avvia `runBootSequence()`, che emette step con il formato `[N/5]` dove N va da 1 a 5 (cinque fase interne di boot). Il prefisso `[boot]` segnala l'inizio di ogni fase; `[migrate]` indica che le migration SQL sono in esecuzione.

**Soglie di allerta**:
- Fase 3 "Pushing Repl layer" > 3 minuti → ⚠️ layer probabilmente > 1.5 GB
- Fase 3 "Creating Autoscale service" > 5 minuti o timeout → ❌ segnale critico
- Fase 4 step singolo > 30 secondi → ⚠️ da investigare
- Fase 4 migration > 10 secondi → ⚠️ migration pesante o lock DB

---

## STEP 1 — Raccolta dati locale (Fase 2)

Esegui questi comandi bash per misurare le directory che contribuiscono al Repl layer e leggere i report di Fase 2:

```bash
# Dimensioni directory che gonfiano il Repl layer
echo "=== DIMENSIONI DIRECTORY REPL LAYER ==="
for dir in \
  ".local/state/replit" \
  "exports" \
  ".git" \
  "dist" \
  "dist-ota-env" \
  "logs" \
  ".local/backups" \
  "attached_assets"; do
  if [ -e "$dir" ]; then
    echo "$dir: $(du -sh "$dir" 2>/dev/null | cut -f1)"
  else
    echo "$dir: (assente)"
  fi
done
echo "TOTALE workspace: $(du -sh . 2>/dev/null | cut -f1)"

# Slow-step report del build script
echo ""
echo "=== SLOW-STEP REPORT (FASE 2) ==="
# Cerca nel log del deploy (se disponibile dal pannello Publish)
# Cerca i marker nel log del workflow
grep -E "⚠️  STEP LENTO|✅ Tutti i 15 step" /tmp/deploy-build.log 2>/dev/null \
  || echo "(log fase 2 non trovato in /tmp/deploy-build.log — cerca nel pannello Publish)"

# Timing OTA (se pertinente)
echo ""
echo "=== OTA TIMING (ultimi 20 log) ==="
tail -20 logs/ota-timing.log 2>/dev/null || echo "(logs/ota-timing.log non trovato)"
```

**Nomi step [N/15] in Fase 2** (da `scripts/deploy-build.sh`):
1. Pulizia asset workspace
2. Pulizia .local/state/ (transcript agente + log DB)
3. Pulizia directory transitorie non runtime
4. Gate Index Drift (statico)
5. Pulizia exports/ e .git/
6. Gate Lint Migration Indexes
7. Gate Dedup Pattern
8. Gate Undefined Route Handlers
9. Gate Hardcoded Agent Model Names
10. Gate Quebracho Bridge Import
11. Gate Quebracho Question Import
12. Verifica versioni stabili dipendenze critiche
13. Build server TypeScript
14. Bake binario cloudflared
15. Verifica PDF matching-system

---

## STEP 2 — Fetch log Replit (Fase 3)

Usa `fetch_deployment_logs` (disponibile via CodeExecution) o leggi il pannello Publish per le righe della piattaforma.

**Cosa cercare:**

```
Pushing Repl layer          → misura durata (allerta: > 3 min)
Pushing Repl (cache) layer  → di solito veloce (< 1 min)
Creating Autoscale service  → misura durata (allerta: > 5 min o timeout)
Waiting for service to be ready → indica se il container non parte
```

**Se "Creating Autoscale service" va in timeout senza log** (build esce 9-10s dopo "Created Repl (cache) layer"):
- Causa quasi certa: Repl layer > 2 GB (limite Cloud Run)
- Soluzione: vedi STEP 1 — directory da pulire

**Segni di boot container fallito in Fase 4**:
- Log produzione mostrano `[boot]` ma nessun `[5/5]`
- Presenza di righe `[CRASH] uncaughtException` o `[CRASH] unhandledRejection`
- Server risponde 503 invece di 200

---

## STEP 3 — Horus analitico (analisi strutturale boot)

Questo step esegue un'analisi multi-fase del codebase focalizzata sull'area `boot`.

**Comando** (dalla shell del planner — filesystem potrebbe essere read-only):

```bash
HORUS_LOG_DIR=/tmp HORUS_BACKLOG_DIR=/tmp \
  npx tsx scripts/horus-app-analysis.ts --area boot --no-propose
```

**Flag usati**:
- `--area boot` → analisi focalizzata su `server/boot-sequence.ts`, `server/boot-phase3-db-init.ts`, `server/boot-phase5-schedulers.ts`
- `--no-propose` → non apre la proposta formale (quella arriverà in STEP 6)
- `HORUS_LOG_DIR=/tmp` → output scritto in `/tmp` (sempre scrivibile)

**Timeout atteso**: 5–10 minuti (pipeline multi-fase: pivot → deep dive boot → sintesi).

**Path report generato**: `/tmp/horus-analysis-<timestamp>.md`

Salva il path per usarlo in STEP 5:

```bash
HORUS_REPORT=$(ls -t /tmp/horus-analysis-*.md 2>/dev/null | grep -v architect | head -1)
echo "Report Horus: $HORUS_REPORT"
```

---

## STEP 4 — Triage opzionale (solo se ci sono crash visibili)

**Esegui SOLO SE** i log di produzione mostrano crash, errori 5xx, o restart multipli post-deploy.

```bash
HORUS_LOG_DIR=/tmp HORUS_BACKLOG_DIR=/tmp \
  npx tsx scripts/log-analysis-horus.ts --only-internal --tail 200 --no-propose
```

- `--only-internal` → salta GitHub e Sentry (solo DB + filesystem + git log)
- `--tail 200` → 200 righe per file di log (sufficiente per crash recenti)
- `--no-propose` → nessuna proposta formale, solo report

Se non ci sono crash visibili, salta questo step.

---

## STEP 5 — Report intermedio (bundle per Horus correttivo)

L'agente costruisce internamente un **bundle testuale** con:

1. **Dimensioni directory** (da STEP 1): dimensioni misurate di `.local/state/replit/`, `exports/`, `.git/`, `dist/`, `logs/`, `attached_assets/`
2. **Timing Fase 3** (da STEP 2): durata "Pushing Repl layer" e "Creating Autoscale service"
3. **Timing Fase 4** (da STEP 2/3): step più lento tra i `[N/5]`, durata totale boot
4. **Sezione `## ANOMALIE TROVATE`** estratta dal report `/tmp/horus-analysis-<timestamp>.md` (STEP 3)
5. **Sezione `## TASK PROPOSTI DA HORUS`** estratta dallo stesso report

**Come estrarre le sezioni dal report**:

```bash
HORUS_REPORT=$(ls -t /tmp/horus-analysis-*.md 2>/dev/null | grep -v architect | head -1)
if [ -n "$HORUS_REPORT" ]; then
  # Estrai sezione ANOMALIE
  awk '/^## ANOMALIE TROVATE/{found=1} found && /^## [A-Z]/ && !/^## ANOMALIE TROVATE/{found=0} found{print}' "$HORUS_REPORT"
  echo "---"
  # Estrai sezione TASK PROPOSTI
  awk '/^## TASK PROPOSTI DA HORUS/{found=1} found && /^## [A-Z]/ && !/^## TASK PROPOSTI DA HORUS/{found=0} found{print}' "$HORUS_REPORT"
fi
```

**Decisione**: se il bundle contiene almeno un'anomalia nelle sezioni ANOMALIE o TASK PROPOSTI → procedi con STEP 6 (chiamata Horus correttiva). Se entrambe le sezioni sono vuote o assenti → vai direttamente all'**Uscita B**.

---

## STEP 6 — Chiamata Horus correttiva

> **Quando lanciarla**: solo se STEP 5 ha trovato almeno un'anomalia. Se il report è pulito, salta a **Uscita B**.

### Come lanciarla (streaming NDJSON — obbligatorio per CF tunnel)

> ⚠️ **IMPORTANTE**: usare sempre `stream: true`. Con `stream: false` Cloudflare taglia la connessione con HTTP 524 dopo ~100s (CF idle timeout). Lo streaming mantiene viva la connessione dal primo token. Vedi `.agents/memory/horus-direct-call-method.md`.

```bash
# Costruisci il bundle (sostituisci [BUNDLE] con il contenuto reale da STEP 5)
BUNDLE="[incolla qui: dimensioni directory + timing fase 3/4 + sezioni ANOMALIE + TASK dal report Horus]"

PROMPT="Sei un ingegnere esperto del sistema BikerLink. Hai appena analizzato un deploy.
Ecco le anomalie trovate:

$BUNDLE

Per ogni anomalia, proponi un task correttivo concreto con questo formato ESATTO:
TASK: <titolo breve in italiano (max 10 parole)>
PRIORITA: alta|media|bassa
PROBLEMA: <una riga — l'evidenza concreta dal deploy>
AZIONE: <una riga — cosa modificare e in quale file>

Se un'anomalia è già risolta o non richiede azione, scrivila sotto ## IGNORATI con motivazione.
Se non ci sono anomalie da correggere, scrivi solo: TUTTO_OK"

curl -s --no-buffer --max-time 300 \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -d "{
    \"model\": \"${HORUS_OLLAMA_MODEL:-qwen3:4b}\",
    \"stream\": true,
    \"think\": false,
    \"options\": {\"num_predict\": 800},
    \"messages\": [{\"role\": \"user\", \"content\": $(echo "$PROMPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]
  }" \
  "$HORUS_OLLAMA_URL/api/chat" | python3 -c "
import sys, json, re
chunks = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
        chunk = d.get('message', {}).get('content', '') or ''
        if chunk:
            chunks.append(chunk)
    except Exception:
        pass
text = ''.join(chunks)
text = re.sub(r'<think>[\s\S]*?</think>', '', text)
text = re.sub(r'^[\s\S]*?</think>\s*', '', text)
print(text.strip())
"
```

**Parametri Horus**: `think: false`, `num_predict: 800`, `stream: true`. Tieni il prompt BUNDLE < 300 parole per risposta rapida e sotto il budget CF.

### Formato risposta atteso

```
TASK: Ridurre dimensione Repl layer prima del push
PRIORITA: alta
PROBLEMA: .local/state/replit/ = 650 MB non rimossa nel deploy del 2026-07-19
AZIONE: verificare step [2/15] in deploy-build.sh — rm -rf .local/state/replit/ deve girare prima del push

TASK: Rallentamento migration al boot — step [3/5]
PRIORITA: media
PROBLEMA: [3/5] ha impiegato 45s (soglia: 10s) — migration 0112_*.sql su tabella ride_telemetry
AZIONE: audit migration 0112 per aggiungere indice concorrente o dividere in step

## IGNORATI
- Pushing cache layer lento (28s): normale per cache layer grande, nessuna azione necessaria.
```

Se Horus risponde `TUTTO_OK` → vai a **Uscita B**.

### Come parsare i blocchi TASK dalla risposta

L'agente estrae ogni blocco con pattern `TASK:` / `PRIORITA:` / `PROBLEMA:` / `AZIONE:` e crea un file plan per ognuno.

**Trasformazione in file plan** (`.local/tasks/deploy-fix-<slug>.md`):

```markdown
# <TASK: titolo>

## What & Why
Deploy BikerLink del <data>. Anomalia rilevata dall'analisi Horus post-deploy.

**Evidenza**: <PROBLEMA: contenuto>

## Done looks like
- Il sintomo descritto in "Problema" non si ripresenta al deploy successivo.
- I log di Fase 3/4 mostrano timing nella norma.

## Out of scope
- Modifiche non correlate al sintomo sopra.

## Steps
1. <AZIONE: contenuto>
2. Verificare nei log del deploy successivo che il sintomo sia risolto.

## Relevant files
- `scripts/deploy-build.sh` — build script Fase 2
- `server/boot-sequence.ts` — boot Fase 4
- `server/boot-phase3-db-init.ts` — DB init e migration runner
```

Slug: `echo "<titolo>" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-40`

---

## STEP 7 — Uscita finale

### Uscita A — Horus ha proposto task

1. **Scrivi il backlog** per la deduplicazione:
   ```bash
   # L'agente scrive i titoli dei task attivi nel file backlog
   # (usando getProjectTasks() o la lista task corrente)
   ```

2. **Scrivi i file plan** in `.local/tasks/deploy-fix-<slug>.md` (formato STEP 6)

3. **Chiama `bulkCreateProjectTasks`** con i task estratti dalla risposta Horus

4. **Riporta in chat**:
   ```
   Ho creato N task correttivi basati sull'analisi di Horus:
   - [titolo 1] (priorità: alta)
   - [titolo 2] (priorità: media)
   - [titolo N] (priorità: bassa)
   ```

### Uscita B — TUTTO_OK o nessuna anomalia

```
✅ Deploy analizzato — nessuna anomalia rilevata.
Fase 3: layer X GB (sotto soglia 1.5 GB)
Fase 4: boot completato in Xs (step più lento: [N/5] NomeStep — Ys)
Horus non ha proposto task correttivi.
```

---

## Tabella pattern ricorrenti

| Sintomo | Causa probabile | Fix | Soglia allerta |
|---------|----------------|-----|---------------|
| "Pushing Repl layer" > 3 min | Layer > 1.5 GB — directory non pulita in Fase 2 | Verificare step [1-5/15] di `deploy-build.sh`; aggiungere directory alla pulizia | > 3 min |
| "Creating Autoscale service" timeout / exit 9-10s dopo cache | Layer > 2 GB (limite Cloud Run) — build "silenziosamente fallito" | Rimuovere `.local/state/replit/`, `exports/`, `.git/` se presenti a deploy-time | > 5 min o exit 0 senza log avvio |
| Fase 4 step [3/5] > 30s | Migration SQL pesante (ALTER su tabella grande, scan full) | Audit migration più recente; usare indice concorrente o split | > 30s per step singolo |
| Migration > 10s (`[migrate]`) | Migration senza indice, UPDATE senza WHERE, tabella grande | Aggiungere `CONCURRENTLY` all'indice; splitting migration in DML separati | > 10s |
| Crash post-deploy (`[CRASH] uncaughtException`) | Boot crash prima di `[5/5]` — import ciclico, secret mancante, migration bloccante | Leggi `/tmp/server-crash.log`; verifica `[boot-phase: X]` nel crash log | Qualsiasi crash |
| Export OTA > 200s | `dist-ota-env/` non pulita o bundle troppo grande | Verificare step [3/15] (pulizia directory transitorie) di `deploy-build.sh` | > 200s |
| Boot lento [1/5] > 20s | DB managed Replit lento al primo connect (ping > 8s) | Normale se DB gestito è sotto carico; non blocca il boot (withDbRetry assorbe); monitorare DB monitor | > 20s |

---

## Relazione con la memoria correlata

| File memoria | Contenuto rilevante |
|---|---|
| `.agents/memory/repl-layer-size.md` | Soglie (~2 GB), directory da pulire, sintomi superamento limite |
| `.agents/memory/deploy-build-cache.md` | Perché NON rimuovere `.cache/` nel build script |
| `.agents/memory/horus-direct-call-method.md` | Template curl streaming (obbligatorio per CF tunnel, stream:true) |
| `.agents/memory/deploy-port-5000.md` | Porta 5000 obbligatoria per il deploy healthcheck |
| `.agents/memory/boot-crash-loop-resilience.md` | Cause crash-loop al boot (seed eager, migration bloccante) |
| `.agents/memory/metro-blocklist-cache.md` | Cache Metro e race condition al boot |
| `.agents/memory/index-drift-gate-deadlock.md` | Perché gate index-drift usa --static-only in Fase 2 |

---

## Verifica TC online prima delle chiamate Horus

Prima di STEP 3 e STEP 6, verifica che il ThinkCentre sia raggiungibile:

```bash
curl -s --max-time 10 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/tags" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('TC online. Models:', [m['name'] for m in d.get('models', [])])
except Exception as e:
    print('TC offline o errore:', e)
"
```

- Lista modelli → TC online ✅ — procedi
- HTML CF Access (403) → secret CF sbagliati o tunnel giù ❌
- Timeout / risposta vuota → TC offline ❌ — salta chiamate Horus, registra solo dati locali

---

## Secret necessari

| Secret | Ruolo |
|--------|-------|
| `HORUS_OLLAMA_URL` | URL base Horus via CF Tunnel (obbligatorio) |
| `HORUS_OLLAMA_TOKEN` | Bearer token applicativo |
| `HORUS_OLLAMA_MODEL` | Modello (default: `qwen3:4b`) |
| `CF_ACCESS_CLIENT_ID` | CF Access header — identità service account |
| `CF_ACCESS_CLIENT_SECRET` | CF Access header — secret service account |
