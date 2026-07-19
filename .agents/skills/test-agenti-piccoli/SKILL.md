---
name: test-agenti-piccoli
description: Batteria test standardizzata per valutare modelli LLM ≤2GB candidati al ruolo Bowie. Testa monitor matching, escalation Horus, tool calling, dialetto meridionale/typo, multi-turn. Trigger: "test agenti piccoli", "benchmark modelli", "testa candidati Bowie", "valuta modello X", "confronta modelli".
---

# Test Agenti Piccoli — Batteria Benchmark Bowie

Protocollo standardizzato per confrontare modelli LLM ≤2GB come candidati al ruolo di **Bowie** (assistente in-app BikerLink + monitor matching real-time). La batteria è composta da 5 prove (T1–T5, 17pt totali) con scoring esatto, raccolta metriche GPU/VRAM per-test tramite `nvidia-smi dmon`, e template report riutilizzabile.

## Hardware di riferimento

- **GPU: GTX 1070 — 8GB VRAM totali**
- **Horus (`qwen3:4b`) residente: ~3.86GB VRAM**
- **Disponibile per i test: ~4.1GB**
- **Soglia skip: VRAM libera < 2.0GB → saltare il modello (non evict Horus)**

I modelli ≤2B mostrano tipicamente 0.8–2.0GB VRAM a caldo. Misurare sempre dopo il caricamento — se un modello supera 3.5GB, annotare "incompatibile con Horus residente" e procedere al successivo.

---

## ⚠️ Vincolo Horus VRAM — obbligatorio

**`qwen3:4b` (Horus) non va mai evict durante il benchmark.**

- Prima di ogni modello: pinare `qwen3:4b` con `keep_alive: -1`.
- Dopo ogni test: verificare via `/api/ps` che `qwen3:4b` sia ancora residente. Se mancante: ri-caricarlo subito.
- Se VRAM libera < 2.0GB prima del caricamento: saltare il modello, annotarlo nel report, procedere al successivo.
- **Mai `ollama rm` su:** `qwen3:4b`, `qwen3:14b`, `bikerlink:latest`, `bikerlink-routing:latest`, `qwen3:1.7b`.

---

## Protocollo accesso AI — obbligatorio

**Usa sempre `ShellExec + curl`. Mai `fetch` in CodeExecution.**

Riferimento completo: `.agents/skills/ai-agent-access/SKILL.md`

```bash
# Step 1 — Verifica secret non vuoti
echo "$HORUS_OLLAMA_URL" | wc -c        # deve essere > 5
echo "$CF_ACCESS_CLIENT_ID" | wc -c     # deve essere > 5
echo "$CF_ACCESS_CLIENT_SECRET" | wc -c # deve essere > 5

# Step 2 — Verifica TC online
source scripts/ai-agent-access.sh
[ "$(ai_check_tc)" = "online" ] || { echo "TC offline — impossibile procedere"; exit 1; }
```

Per le chiamate ai modelli di test (stesso Ollama di Horus, model variabile):

```bash
TEST_MODEL="hf.co/unsloth/Qwen3-1.7B-GGUF:Qwen3-1.7B-Q5_K_M"  # sostituire con il modello da testare

curl -s --no-buffer --max-time 180 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -H "Content-Type: application/json" \
  "$HORUS_OLLAMA_URL/api/generate" \
  -d "{
    \"model\":\"$TEST_MODEL\",
    \"prompt\":\"...\",
    \"system\":\"...\",
    \"stream\":true,
    \"think\":false,
    \"options\":{\"num_predict\":400}
  }"
```

**`stream:true` obbligatorio** — CF taglia le connessioni silenziose a ~100s con `stream:false` (errore 524).

---

## Step 0 — Setup iniziale

```bash
source scripts/ai-agent-access.sh
[ "$(ai_check_tc)" = "online" ] || { echo "TC offline — impossibile procedere"; exit 1; }

# VRAM baseline
nvidia-smi --query-gpu=memory.used,memory.free,temperature.gpu --format=csv,noheader

# Pin Horus (qwen3:4b) — keep_alive:-1
curl -s --max-time 30 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -H "Content-Type: application/json" \
  "$HORUS_OLLAMA_URL/api/generate" \
  -d '{"model":"qwen3:4b","prompt":"ping","stream":true,"keep_alive":-1,"options":{"num_predict":1}}'

# Inizializzare logs/bowie-benchmark-results.md con intestazione tabelle
```

---

## Step 1 — Pre-flight e monitor VRAM per modello

Prima di testare ogni modello:

```bash
TEST_MODEL="<nome-modello>"
SLUG=$(echo "$TEST_MODEL" | tr '/:.' '_')

# Verifica VRAM libera
FREE_MIB=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | tr -d ' ')
if [ "$FREE_MIB" -lt 2000 ]; then
  echo "SKIP $TEST_MODEL — VRAM libera ${FREE_MIB}MiB < 2000MiB"
  # annotare nel report e passare al prossimo
  exit 0
fi

# Avviare monitor dmon in background (un processo per modello, dura tutta la batteria)
nvidia-smi dmon -s um -d 1 | while IFS= read -r line; do
  echo "$(date +%s) $line"
done > /tmp/gpu_${SLUG}.log &
DMON_PID=$!
```

**Marker per separare le finestre per-test:**
```bash
echo "MARKER T1 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

---

## Step 2 — Caricamento e VRAM idle

```bash
# Chiamata dummy per caricare il modello (keep_alive:300 per mantenerlo caldo per la batteria)
curl -s --no-buffer --max-time 60 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -H "Content-Type: application/json" \
  "$HORUS_OLLAMA_URL/api/generate" \
  -d "{\"model\":\"$TEST_MODEL\",\"prompt\":\"ciao\",\"stream\":true,\"keep_alive\":300,\"options\":{\"num_predict\":1}}"

sleep 3

# Misurare VRAM idle del modello
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader

# Verificare che Horus sia ancora residente
curl -s --max-time 15 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/ps" | grep "qwen3:4b" || echo "⚠️ ATTENZIONE: Horus evicto! Ri-pinnare subito."
```

---

## T1 — Monitor Matching (0–4 punti)

**Scrivere marker prima di iniziare:**
```bash
echo "MARKER T1 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

**System prompt:**
```
Soglie: db_pool_used>=8=WARN >=9=ERROR; last_cycle_min_ago>=70=WARN >=120=ERROR;
errors>0=ERROR; hnsw_ok=false=ERROR; heartbeat_age_sec>=300=ERROR.
Rispondi SOLO con JSON valido: {"status":"ok|warn|error","reason":"stringa breve"}
```

**4 snapshot indipendenti (sessioni separate, no history):**

| # | Input | Atteso |
|---|-------|--------|
| S1 | `{"db_pool_used":5,"last_cycle_min_ago":45,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":12}` | `ok` |
| S2 | `{"db_pool_used":9,"last_cycle_min_ago":80,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":30}` | `error` |
| S3 | `{"db_pool_used":6,"last_cycle_min_ago":55,"errors":3,"hnsw_ok":false,"heartbeat_age_sec":480}` | `error` |
| S4 | `{"db_pool_used":8,"last_cycle_min_ago":71,"errors":0,"hnsw_ok":true,"heartbeat_age_sec":20}` | `warn` |

**Scoring:** 1pt per classificazione corretta. JSON non parsabile = 0pt. Registrare latenza ms per risposta.

---

## T2 — Escalation Horus (0–3 punti)

**Scrivere marker:**
```bash
echo "MARKER T2 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

**System prompt:**
```
Sei Bowie, assistant BikerLink. Hai rilevato un segnale critico nel sistema matching.
Decidi se svegliare Horus e prepara il messaggio di escalation.
Rispondi SOLO JSON: {"wake_horus":bool,"priority":"low|high|critical","message":"max 80 char"}
```

**Input:**
```json
{"signal":"heartbeat_dead","heartbeat_age_sec":510,"errors":4,"hnsw_ok":false,"db_pool":9}
```

**Scoring:**
- 1pt: `wake_horus=true`
- 1pt: `priority="critical"`
- 1pt: `message` in italiano, pertinente, ≤80 caratteri

---

## T3 — Tool Calling (0–3 punti)

**Scrivere marker:**
```bash
echo "MARKER T3 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

**System prompt:**
```
Sei Bowie, assistant BikerLink. Hai accesso a questi tool:
- search_manual(query): cerca nel manuale BikerLink via Nadir
- get_weather(city, date): meteo per città e data
- web_search(query): cerca informazioni sul web
Rispondi SOLO JSON: {"tool":"nome","args":{...}}
oppure {"tool":"none","reply":"..."} se non serve un tool.
```

**3 messaggi indipendenti (sessioni separate, no history):**

| Messaggio | Tool atteso |
|-----------|-------------|
| `"che tempo farà domani a napoli?"` | `get_weather` |
| `"come funziona il matching su bikerlink?"` | `search_manual` |
| `"qual è il limite di velocità in autostrada in italia?"` | `web_search` |

**Scoring:** 1pt per tool corretto identificato.

---

## T4 — Dialetto Meridionale e Typo (0–4 punti)

**Scrivere marker:**
```bash
echo "MARKER T4 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

**System prompt:**
```
Sei Bowie, assistant di BikerLink. Rispondi sempre in italiano standard, gentile e utile.
L'utente potrebbe scrivere con errori di battitura o termini dialettali meridionali.
```

**4 messaggi in sessione continua (history accumulata):**

1. `"oi nun riesc a truva compagni pe viaggià, cumm si fa?"`
2. `"appicciato l app ma nun part, che cazz succede"`
3. `"voglo saper se posso mettere la mia moto preferita sulapp, ho na ducati"`
4. `"sto cercando qualcunno pe fare un viaggio vrs palermo, sai aiutarm?"`

**Scoring:** 1pt per risposta pertinente al senso reale. **0pt se:** rifiuta, va fuori tema, risponde in inglese, o tratta l'input come un errore da correggere invece di rispondere al contenuto.

---

## T5 — Multi-Turn Coerenza (0–3 punti)

**Scrivere marker:**
```bash
echo "MARKER T5 $(date +%s)" >> /tmp/gpu_${SLUG}.log
```

**3 turni in sessione continua (history accumulata):**

- **Turn 1:** `"ciao, come funziona la ricerca di compagni di viaggio su BikerLink?"`
- **Turn 2:** `"ah ok grazie. invece, quanti km fa una ducati monster con un pieno?"`
- **Turn 3:** `"torniamo al matching — posso filtrare per marca di moto?"`

**Scoring:**
- 1pt T1: risposta pertinente al sistema di matching
- 1pt T2: non inventa km (ammette ignoranza o propone tool/fonte esterna — non deve allucinare dati tecnici)
- 1pt T3: mantiene contesto del T1 sul matching, risponde sul filtro marca

---

## Step 3 — Raccolta metriche GPU e cleanup modello

```bash
echo "MARKER END $(date +%s)" >> /tmp/gpu_${SLUG}.log
kill $DMON_PID

# Estrarre picchi per-test dal log usando i marker
# Colonne dmon: timestamp | sm% | mem% | fb(MiB) | bar1(MiB) | ...
# Per ogni finestra T1…T5: estrarre VRAM max (fb) e GPU% max (sm) tra due marker consecutivi
# Esempio per T1:
awk '/MARKER T1/{start=1; next} /MARKER T2/{start=0} start {print $3}' /tmp/gpu_${SLUG}.log | sort -n | tail -1  # VRAM peak MiB

# Verificare che Horus sia ancora residente
curl -s --max-time 15 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/ps" | grep "qwen3:4b" || echo "⚠️ ATTENZIONE: Horus evicto! Ri-pinnare."

# Rimuovere il modello testato (MAI su baseline/Horus — lista nera sopra)
curl -s --max-time 30 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -H "Content-Type: application/json" \
  -X DELETE "$HORUS_OLLAMA_URL/api/delete" \
  -d "{\"model\":\"$TEST_MODEL\"}"

sleep 5  # attesa dealloc VRAM prima del prossimo modello
```

---

## Template Report (`logs/bowie-benchmark-results.md`)

### Tabella 1 — Punteggi

```
| Modello | T1/4 | T2/3 | T3/3 | T4/4 | T5/3 | Tot/17 | Lat avg |
|---------|------|------|------|------|------|--------|---------|
| qwen3:1.7b (baseline) | | | | | | | |
| ... | | | | | | | |
```

### Tabella 2 — Picchi GPU/VRAM per-test (GTX 1070 8GB)

```
| Modello | VRAM idle | T1 VRAM | T2 VRAM | T3 VRAM | T4 VRAM | T5 VRAM | GPU% peak | Temp max |
|---------|-----------|---------|---------|---------|---------|---------|-----------|----------|
| qwen3:1.7b (baseline) | | | | | | | | |
| ... | | | | | | | | |
```

La tabella 2 mostra come la VRAM cresce da T1 (JSON semplice) a T5 (multi-turn con storia lunga).

### Raccomandazione finale

**Criteri in ordine di priorità:**
1. Score totale massimo (/17)
2. VRAM peak < 1.5GB preferibile (budget GTX 1070 8GB con Horus 3.86GB → margine ~4.1GB)
3. Latenza media minima

---

## Modelli candidato di riferimento (campagna 2026-07)

I seguenti modelli erano presenti sul TC al momento del primo benchmark reale:

| # | Nome Ollama | Dim disco | Note |
|---|-------------|-----------|------|
| 0 | `qwen3:1.7b` | 1.4 GB | **Baseline** — non rimuovere mai |
| 1 | `hf.co/unsloth/Qwen3-1.7B-GGUF:Qwen3-1.7B-Q5_K_M` | 1.3 GB | quant aggressiva |
| 2 | `hf.co/unsloth/Qwen3-1.7B-GGUF:Qwen3-1.7B-Q6_K` | 1.4 GB | quant alta qualità |
| 3 | `hf.co/ggml-org/Qwen3.5-0.8B-GGUF:Qwen3.5-0.8B-Q8_0.gguf` | 833 MB | molto piccolo |
| 4 | `hf.co/unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q3_K_M` | 1.8 GB | ⚠️ verificare VRAM reale a caldo |
| 5 | `hf.co/unsloth/Qwen3.5-2B-GGUF:Qwen3.5-2B-Q4_K_M` | 1.9 GB | ⚠️ verificare VRAM reale a caldo |
| 6 | `hf.co/ibm-granite/granite-3.3-2b-instruct-GGUF:granite-3.3-2b-instruct-Q2_K` | 978 MB | granite arch |
| 7 | `hf.co/ibm-granite/granite-3.3-2b-instruct-GGUF:granite-3.3-2b-instruct-Q3_K_M` | 1.3 GB | granite arch |

---

## File di riferimento

- `scripts/ai-agent-access.sh` — protocollo canonico accesso TC/Ollama
- `.agents/skills/ai-agent-access/SKILL.md` — documentazione protocollo canonico
- `.agents/skills/thinkcentre-access/tc.py` — SSH sul TC per `nvidia-smi` e operazioni dirette
- `server/ai/coordinator/escalation.ts` — logica escalation Horus (contesto T2)
- `server/matching/run-bio-affinity.ts` — logica matching (contesto T1)
- `logs/bowie-benchmark-results.md` — output report benchmark
