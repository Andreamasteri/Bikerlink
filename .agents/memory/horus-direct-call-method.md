---
name: Horus direct call method (analyst + architect)
description: Come chiamare Horus e Horus-Architect direttamente dall'agente via curl/ShellExec per review task, con i limiti CF Access e i workaround streaming.
---

# Horus — chiamata diretta dall'agente

## Metodo funzionante: ShellExec + curl

CodeExecution **non funziona** per chiamare Horus direttamente:
- `fetch` non è definito nel runtime durable (fuori da `"use impure"`)
- `AbortSignal` non è definito dentro `"use impure"`
- `"use impure"` non può catturare binding esterni (variabili definite fuori dalla funzione impure)
- `process.env` non è definito nel runtime durable

**→ Usare sempre ShellExec con curl.**

## Fix CF 524 — usa sempre `stream: true`

`HORUS_OLLAMA_URL`, `HORUS_ANALYSIS_URL` e `HORUS_HUB_URL` sono tutti dietro Cloudflare.
Con `stream: false` Ollama genera l'intera risposta prima di mandare il primo byte HTTP.
Con `qwen3:4b` e prompt da 100-200 parole la generazione richiede 60-90s.
CF vede il tunnel silenzioso per ≥ 100s → taglia con **HTTP 524** (origin timeout).

**La soluzione: `stream: true`.**
In streaming il primo token arriva in 2-5s (i modelli sono già in VRAM, `keep_alive:-1`).
CF riceve dati immediatamente → l'idle timeout si azzera ad ogni chunk → la connessione
rimane viva per tutta la durata della generazione, indipendentemente da quanto tempo richieda.

**Non serve più limitare `num_predict`** come workaround al timeout — il limite artificiale
è rimosso. Usare valori generosi (800-1600) per risposta completa.

## callOllamaChat — opzione stream:true

Per le chiamate server-side (non curl) che producono output lungo (>700 token), passare
`stream: true` in `OllamaChatOptions`. Questo usa `streamText` invece di `generateText`,
il che fa chiamare `doStream` (Ollama `stream:true`) invece di `doGenerate` (Ollama
`stream:false`). CF riceve il primo token in 2-5s e l'idle timeout si azzera.

Usato in: `synthesizeGroup`, `mergeProposals` (finalize.ts) e `writeManualSection`,
`writeLexiconSection`, `writeManualOverview`, `writeManualGlossary` (finalize-manual.ts).

## CF Tunnel — configurazione timeout (azione manuale one-time)

Per sicurezza strutturale, configurare anche l'`httpResponseTimeout` nel dashboard CF:

**Percorso:** Zero Trust → Networks → Tunnels → `[tunnel bikerlink]` → Edit →
Public Hostname → hostname Ollama (`ollama.biker-link.net`) → Additional application settings →
HTTP Response Timeout → **300s**

Questo è un fallback per quando il TC è sotto carico e il primo token tarda >100s.
Con lo streaming attivo è raramente necessario, ma elimina la causa strutturale.

## Segreti necessari

| Secret | Ruolo |
|--------|-------|
| `CF_ACCESS_CLIENT_ID` | CF Access header — identità service account |
| `CF_ACCESS_CLIENT_SECRET` | CF Access header — secret service account |
| `HORUS_OLLAMA_TOKEN` | Bearer token applicativo Horus (≠ CF Access) |
| `HORUS_OLLAMA_URL` | Base URL Ollama sul ThinkCentre (via CF tunnel) |
| `HORUS_OLLAMA_MODEL` | Nome modello (es. `qwen3:4b`) |

## Verifica TC online prima di ogni chiamata

```bash
curl -s --max-time 10 \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  "$HORUS_OLLAMA_URL/api/tags" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Models:', [m['name'] for m in d.get('models', [])])
"
```

Interpretazione risposta:
- Lista modelli → TC online ✅
- Pagina HTML CF Access (403) → secret CF sbagliati o tunnel giù
- HTTP 524 / timeout shell → CF ha tagliato (TC molto lento o tunnel non risponde)
- Risposta vuota → TC offline

## Template curl — Analyst (streaming NDJSON)

```bash
PROMPT='Il tuo prompt conciso qui (fino a 500 parole)'

curl -s --no-buffer --max-time 300 \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -d "{
    \"model\": \"${HORUS_OLLAMA_MODEL:-qwen3:4b}\",
    \"stream\": true,
    \"think\": false,
    \"options\": {\"num_predict\": 1200},
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
# Strip <think>...</think> completo
text = re.sub(r'<think>[\s\S]*?</think>', '', text)
# Strip orphan closing </think> e tutto ciò che precede (qwen3 omette il tag di apertura)
text = re.sub(r'^[\s\S]*?</think>\s*', '', text)
print(text.strip())
"
```

## Template curl — Architect (streaming NDJSON, sequenziale dopo analyst)

```bash
# Salva prima l'output dell'analyst in ANALYST_OUTPUT
ANALYST_OUTPUT='...output analyst qui...'

PROMPT="Sei Horus-Architect BikerLink. Revisiona architetturalmente questo piano. Max 10 righe.
1. Problemi dall'analyst: bloccanti vs accettabili
2. Decisioni architetturali mancanti o da correggere
3. Raccomandazione finale: pronto per Economy o serve raffinamento?

ANALYST: $ANALYST_OUTPUT"

curl -s --no-buffer --max-time 300 \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -d "{\"model\":\"${HORUS_OLLAMA_MODEL:-qwen3:4b}\",\"stream\":true,\"think\":false,\"options\":{\"num_predict\":1000},\"messages\":[{\"role\":\"user\",\"content\":$(echo "$PROMPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]}" \
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

## Flusso consigliato per review task

1. Verifica TC online (`/api/tags`, `--max-time 10`)
2. Chiama analyst con prompt (fino a 500 parole, `num_predict 1200`, stream:true)
3. Salva output analyst in variabile bash
4. Chiama architect con output analyst come contesto (`num_predict 1000`, stream:true)

## Note su HORUS_ANALYSIS_URL e HORUS_HUB_URL

Entrambi i secret puntano a domini CF con lo stesso problema di timeout.
Con `stream: true` il problema è risolto per entrambi — il primo token azzera l'idle timer CF.

**Why:** con `stream: false` CF vede connessione silenziosa → 524 dopo ~100s.
Con `stream: true` il primo token arriva in 2-5s → CF mantiene viva la connessione
per tutta la durata della generazione. Il vincolo `num_predict ≤ 700` era un workaround
temporaneo al timeout, non più necessario.
