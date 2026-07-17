---
name: Horus direct call method (analyst + architect)
description: Come chiamare Horus e Horus-Architect direttamente dall'agente via curl/ShellExec per review task, con i limiti CF Access e i workaround.
---

# Horus — chiamata diretta dall'agente

## Metodo funzionante: ShellExec + curl

CodeExecution **non funziona** per chiamare Horus direttamente:
- `fetch` non è definito nel runtime durable (fuori da `"use impure"`)
- `AbortSignal` non è definito dentro `"use impure"`
- `"use impure"` non può catturare binding esterni (variabili definite fuori dalla funzione impure)
- `process.env` non è definito nel runtime durable

**→ Usare sempre ShellExec con curl.**

## Limite critico: CF timeout a 100s

`HORUS_OLLAMA_URL`, `HORUS_ANALYSIS_URL` e `HORUS_HUB_URL` sono tutti dietro Cloudflare.
CF taglia la connessione dopo ~100s con HTTP 524 (origin timeout).

Con `think: false` e `qwen3:4b`, la risposta arriva in ~60-90s se `num_predict ≤ 700`.

**Regola:** `num_predict` ≤ 600 per l'analyst, ≤ 700 per l'architect. Prompt brevi (< 300 parole).

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
- HTTP 524 / timeout shell → CF ha tagliato (prompt troppo lungo o TC molto lento)
- JSON vuoto o errore JSON → risposta troncata, riduci `num_predict`
- Risposta vuota → TC offline

## Template curl — Analyst

```bash
PROMPT='Il tuo prompt conciso qui (< 200 parole)'

curl -s --max-time 90 \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -d "{
    \"model\": \"${HORUS_OLLAMA_MODEL:-qwen3:4b}\",
    \"stream\": false,
    \"think\": false,
    \"options\": {\"num_predict\": 600},
    \"messages\": [{\"role\": \"user\", \"content\": $(echo "$PROMPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]
  }" \
  "$HORUS_OLLAMA_URL/api/chat" | python3 -c "
import sys, json, re
d = json.loads(sys.stdin.read())
c = d.get('message', {}).get('content', '') or d.get('response', '')
print(re.sub(r'<think>.*?</think>', '', c, flags=re.DOTALL).strip())
"
```

## Template curl — Architect (sequenziale dopo analyst)

```bash
# Salva prima l'output dell'analyst in ANALYST_OUTPUT
ANALYST_OUTPUT='...output analyst qui...'

PROMPT="Sei Horus-Architect BikerLink. Revisiona architetturalmente questo piano. Max 10 righe.
1. Problemi dall'analyst: bloccanti vs accettabili
2. Decisioni architetturali mancanti o da correggere
3. Raccomandazione finale: pronto per Economy o serve raffinamento?

ANALYST: $ANALYST_OUTPUT"

curl -s --max-time 90 \
  -H "Content-Type: application/json" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $HORUS_OLLAMA_TOKEN" \
  -d "{\"model\":\"${HORUS_OLLAMA_MODEL:-qwen3:4b}\",\"stream\":false,\"think\":false,\"options\":{\"num_predict\":700},\"messages\":[{\"role\":\"user\",\"content\":$(echo "$PROMPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}]}" \
  "$HORUS_OLLAMA_URL/api/chat" | python3 -c "
import sys, json, re
d = json.loads(sys.stdin.read())
c = d.get('message', {}).get('content', '') or d.get('response', '')
print(re.sub(r'<think>.*?</think>', '', c, flags=re.DOTALL).strip())
"
```

## Flusso consigliato per review task

1. Verifica TC online (`/api/tags`, `--max-time 10`)
2. Chiama analyst con prompt breve (< 200 parole, `num_predict 600`)
3. Salva output analyst in variabile bash
4. Chiama architect con output analyst come contesto (`num_predict 700`)
5. Se l'architect tima out per CF (524), sintetizza tu basandoti sull'analyst

## Note su HORUS_ANALYSIS_URL e HORUS_HUB_URL

Entrambi i secret puntano a domini CF (`analysis.biker-link.net`, `hub.biker-link.net`) con lo stesso timeout a 100s. Non bypassano il limite CF. Usarli non risolve il problema.

**Why:** CF timeout 100s è il vincolo dominante per qualsiasi chiamata diretta a Horus dall'agente. La qualità della risposta degrada se il prompt è lungo (il modello usa più token per ragionare). Prompt brevi + `think:false` + `num_predict` contenuto è l'unico modo per restare sotto il limite.
