---
name: TC ai-hub integration (file sharing + nadir search)
description: How BikerLink reaches the shared TC ai-hub, why it's proxied through the agent (not nginx), and the graceful-fallback contract.
---

# TC ai-hub — cablaggio tool AI BikerLink

`ai-hub` è un servizio Express condiviso BikerLink/BikerBlog sul ThinkCentre
(`/home/andrea/ai-hub`, pm2 `ai-hub`, porta 4405, `SHARED_ROOT=~/agent-shared`).
Ha un PROPRIO gate token (`HUB_GATE_TOKEN`, header `X-Hub-Gate-Token`) e espone
`/health`, `/files/{write,read,list}`, `/vram`, `/tools`, `/nadir/search`.

## Esposizione: via agent proxy, NON nginx
`tc.biker-link.net` è servito dal **Cloudflare tunnel → thinkcentre-agent**
(`thinkcentre-agent/server.js`, pm2 `bikerlink-agent`, porta 9199), NON da nginx
(nginx sul TC è LAN-only/legacy su `192.168.0.100:443` con domini duckdns).
Quindi ai-hub si espone aggiungendo un reverse-proxy `/ai-hub/*` DENTRO l'agente
(stesso pattern di `/kalman/*`), non con un `location` nginx.

**Why:** l'agente non può creare ingress Cloudflare; è già dietro CF Access +
`X-Agent-Token`. Vedi `tc-agent-localhost-proxy-pattern.md` e
`thinkcentre-exposure-reality.md`.

**Eccezione auth chiave:** `/ai-hub/*` è ESENTE dal controllo `X-Agent-Token`
dell'agente, perché l'ai-hub valida da sé `X-Hub-Gate-Token` e CF Access protegge
l'edge. Perciò il client Replit invia SOLO `X-Hub-Gate-Token` + header CF Access
(nessun `THINKCENTRE_AGENT_TOKEN`). Se aggiungi qui l'auth dell'agente, il client
va in 401.

## Contratto Replit-side
- Secret: `AI_HUB_URL` (`https://hub.biker-link.net` in prod; storicamente
  `https://tc.biker-link.net/ai-hub`) + `AI_HUB_GATE_TOKEN` (= `HUB_GATE_TOKEN` <!-- pragma: allowlist secret -->
  del `.env` ai-hub).
- **Gate-token drift = 401 `{"error":"unauthorized"}`** su `/nadir/search`. Il
  secret Replit `AI_HUB_GATE_TOKEN` DEVE combaciare byte-per-byte con
  `HUB_GATE_TOKEN` in `/home/andrea/ai-hub/.env` sul TC. Per risincronizzare:
  `sed -i` il `.env`, `pm2 restart ai-hub --update-env`, poi ri-setta il secret.
  Verifica veloce senza toccare il secret: `AI_HUB_GATE_TOKEN=<tc-value> npx tsx
  scripts/smoke-ai-hub-search.ts`.
- Client: `server/lib/ai-hub-client.ts` — `hubGet/hubPost` non lanciano mai
  (ritornano `{ok,...}`), timeout 8s, riusa `cfAccessHeaders()`.
  `isHubAvailable()` è OTTIMISTA (true) e viene flippato SOLO dal collector
  watchdog (`setHubReachable`), non dalle singole chiamate → niente flapping.
- Tool: `read_file`/`list_files` a Bowie+Horus; `save_file`+`check_vram_usage`
  solo Horus (admin). Ares/Quebracho NON ricevono `tool()` nativi
  (vedi `ares-quebracho-no-native-tools.md`).
- `search_manual`: prova ai-hub `/nadir/search` quando disponibile, altrimenti
  (o su qualsiasi errore) fallback a `searchNadir()` pgvector locale. pgvector
  RESTA su Replit — l'ai-hub è solo il layer file+embed sul TC.

## /nadir/search (ai-hub) — gotcha GPU
Implementato come modulo `nadir-search.js` (embed via Ollama `all-minilm`,
cosine sim, cache per-file su `mtimeMs`, chunk 600). **Quando la GPU del TC cade
dal bus** (`nvidia-smi` "Unable to determine the device handle ... Unknown
Error") gli embedding NON danno errore: *appendono*. Per questo l'embed ha un
timeout esplicito → 503, così il client Replit (8s) fa fallback a pgvector.
Recupero GPU = problema hardware/alimentazione (spesso serve reboot), non driver
(vedi `tc-gpu-boot-persona-preload.md`); non riavviare il TC senza consenso.
