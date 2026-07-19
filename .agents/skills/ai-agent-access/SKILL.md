# AI Agent Access — Canonical Protocol

**Trigger keywords:** Horus, Ares, TC-agent, ThinkCentre, HORUS_OLLAMA, DIAG_OLLAMA, CF_ACCESS, ollama-tc, api/chat, agente AI

---

## Regola tool (OBBLIGATORIA)

**Usa sempre `ShellExec` + `curl`. MAI `fetch` in CodeExecution.**

- `fetch` non è definito nel durable runtime (CodeExecution)
- `AbortSignal` non è disponibile dentro `"use impure"`
- `process.env` non è definito nel runtime durable
- `"use impure"` non può catturare binding di variabili esterne

→ Per qualsiasi chiamata a Horus, Ares o TC-agent: **ShellExec con curl**.

---

## Script canonico

Il file `scripts/ai-agent-access.sh` contiene quattro funzioni pronte. Sourciane il contenuto o eseguilo direttamente:

```bash
# Source per usare le funzioni in una ShellExec più lunga
source scripts/ai-agent-access.sh

# Self-test (≤12s, non blocca su cold load)
bash scripts/ai-agent-access.sh --self-test
```

---

## Ordine canonico — 3 step non negoziabili

**Step 1 — Verifica secret non vuoti**

```bash
# Ogni secret critico deve avere almeno 5 caratteri
echo "$HORUS_OLLAMA_URL" | wc -c       # deve essere > 5
echo "$CF_ACCESS_CLIENT_ID" | wc -c    # deve essere > 5
echo "$CF_ACCESS_CLIENT_SECRET" | wc -c # deve essere > 5
```

**Step 2 — Verifica TC online (≤10s, exit ≠ 0 → fermarsi con errore chiaro)**

```bash
source scripts/ai-agent-access.sh
STATUS=$(ai_check_tc)
echo "TC status: $STATUS"
if [ "$STATUS" != "online" ]; then
  echo "ERROR: TC non raggiungibile ($STATUS) — impossibile procedere"
  exit 1
fi
```

**Step 3 — Chiamata con stream:true, max-time 180, parser strip**

```bash
source scripts/ai-agent-access.sh
RESPONSE=$(ai_call_horus "Il tuo prompt qui")
echo "$RESPONSE"
```

---

## Tabella secret per persona

| Persona | Secret richiesti | Header curl |
|---------|-----------------|-------------|
| **Horus** | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `HORUS_OLLAMA_URL`, `HORUS_OLLAMA_TOKEN`, `HORUS_OLLAMA_MODEL` | `CF-Access-Client-Id`, `CF-Access-Client-Secret`, `Authorization: Bearer $HORUS_OLLAMA_TOKEN` |
| **Ares** | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `DIAG_OLLAMA_URL`, `DIAG_OLLAMA_TOKEN`, `DIAG_OLLAMA_MODEL` | `CF-Access-Client-Id`, `CF-Access-Client-Secret`, `Authorization: Bearer $DIAG_OLLAMA_TOKEN` |
| **TC-agent** | `THINKCENTRE_METRICS_URL`, `THINKCENTRE_AGENT_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | `X-Agent-Token: $THINKCENTRE_AGENT_TOKEN`, `CF-Access-Client-Id`, `CF-Access-Client-Secret` |

### Token per-servizio TC (probe auth parity)

Ogni servizio TC usa un header custom — NON `Authorization: Bearer` generico:

| Servizio | Header auth |
|----------|-------------|
| GraphHopper | `X-GH-Token` |
| Valhalla | `X-Valhalla-Key` |
| Photon | `X-Photon-Token` |
| Whisper | `X-Whisper-Token` |
| Ollama (raw) | `X-Ollama-Token` |
| TC-agent | `X-Agent-Token` |

---

## Tabella diagnostica errori

| HTTP / Condizione | Causa | Rimedio |
|---|---|---|
| 403 con body HTML CF Access | `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` sbagliati o scaduti | Ruota i secret nel pannello Replit |
| 502 su tutti gli host + SSH timeout | TC box spento o `cloudflared` giù | Infrastruttura utente (hardware/tunnel) |
| 524 | `stream:false` usato per errore — CF taglia a ~100s di silenzio | Aggiungi `"stream":true` |
| 000 o DNS fail | Secret vuoto → URL malformato | Verifica con `echo $VAR \| wc -c` |
| 401 con header `cf-access-error` | CF Access policy — client ID/secret non riconosciuti | Verifica CF_ACCESS_CLIENT_ID/SECRET |
| 401 senza `cf-access-error` | Token applicativo sbagliato (`HORUS_OLLAMA_TOKEN` etc.) | Verifica il token di servizio |
| 0 byte dopo 30s | Modello in cold load — normale per qwen3:4b | Aumenta `--max-time` a 180s |
| Testo risposta in inglese | `think:false` su qwen3 fa "trapelare" reasoning nel testo | Usa lo strip incluso nello script (`ai_call_horus`/`ai_call_ares`) |
| Secret empty dopo restart | Secret nuovo non ancora propagato | Riavvia il workflow ("Start Backend") |

---

## Snippet per ogni funzione

### `ai_check_tc` — verifica raggiungibilità (≤10s)

```bash
source scripts/ai-agent-access.sh
STATUS=$(ai_check_tc)
# Output possibili: online | offline | cf-blocked | auth-failed | secret-empty
echo "TC: $STATUS"
```

### `ai_call_horus` — chiamata Horus

```bash
source scripts/ai-agent-access.sh

# Verifica TC prima
[ "$(ai_check_tc)" = "online" ] || { echo "TC offline"; exit 1; }

# Chiamata (max-time 180s internamente, strip think + reasoning inglese)
RESPONSE=$(ai_call_horus "Analizza questo problema: ...")
echo "$RESPONSE"

# Con num_predict custom (default: 1200)
RESPONSE=$(ai_call_horus "Prompt breve" 600)
```

### `ai_call_ares` — chiamata Ares diagnostica

```bash
source scripts/ai-agent-access.sh

# Ares usa DIAG_OLLAMA_* (separati da HORUS_OLLAMA_*)
# Se i secret mancano: stampa messaggio chiaro ed esce 1 senza crash
RESPONSE=$(ai_call_ares "Diagnostica questo crash: ...")
echo "$RESPONSE"
```

### `ai_call_tc_agent` — chiamata TC-agent API

```bash
source scripts/ai-agent-access.sh

# GET endpoint (max-time 30s)
HEALTH=$(ai_call_tc_agent "health")
echo "$HEALTH"

# POST con body JSON
RESULT=$(ai_call_tc_agent "repo-drift" "GET")
echo "$RESULT"

# POST con JSON body
RESULT=$(ai_call_tc_agent "some-endpoint" "POST" '{"key":"value"}')
echo "$RESULT"
```

---

## Note operative

### Cold load models

| Modello | Tempo primo token | Comportamento |
|---------|------------------|---------------|
| `qwen3:1.7b` | ~2s (tipicamente in VRAM con `keep_alive:-1`) | Usa per smoke test e risposte brevi |
| `qwen3:4b` | ~125s a freddo, ~2s se in VRAM | Usa `--max-time 180` sempre |
| `devstral:latest` (Ares) | 55–170s | Usa `--max-time 180` sempre |

### stream:true è obbligatorio

CF Cloudflare taglia le connessioni silenziose dopo ~100s (524).
Con `stream:true` il primo token arriva in 2–5s → CF rinnova il timer idle → la connessione rimane viva per tutta la generazione, indipendentemente dalla durata.

**Non usare mai `stream:false` con questi modelli dietro CF tunnel.**

### Ares non disponibile in tutti gli env

`DIAG_OLLAMA_*` sono secret configurati solo in ambienti specifici. `ai_call_ares` stampa `[Ares non configurato in questo env: ...]` ed esce con codice 1 senza crashare — questo comportamento è intenzionale.

### Nuovi secret non propagano senza restart

Un secret appena aggiunto (o modificato nel valore) non appare in ShellExec/CodeExecution finché il workflow non viene riavviato ("Start Backend"). Verifica sempre con `echo $VAR | wc -c` dopo un restart.

---

## Riferimenti memoria

- `.agents/memory/horus-direct-call-method.md` — template curl completi, spiegazione fix CF 524
- `.agents/memory/cf-tunnel-origin-down-vs-secret.md` — come distinguere "origin down" da "secret sbagliato"
- `.agents/memory/tc-probe-auth-header-parity.md` — token per-servizio e parity probe
- `.agents/memory/ai-tri-persona-handoff.md` — wiring Bowie/Horus/Ares nel routing server
- `.agents/memory/tc-agent-localhost-proxy-pattern.md` — esporre nuovi servizi TC senza toccare CF
- `.agents/memory/ares-wake-on-lan.md` — come svegliare Ares da standby
