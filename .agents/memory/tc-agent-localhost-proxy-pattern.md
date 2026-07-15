---
name: Exposing a new ThinkCentre service without a Cloudflare ingress change
description: Route new self-hosted TC services through the thinkcentre-agent's /<name>/* reverse-proxy instead of a new CF dashboard ingress rule.
---

# Exporre un nuovo servizio TC senza toccare la dashboard Cloudflare

**Regola:** per rendere raggiungibile dal backend cloud un NUOVO servizio
self-hosted sul ThinkCentre, NON serve (e l'agente non può fare) una nuova
ingress rule nella dashboard Cloudflare. Si fa bind del nuovo servizio SOLO su
`127.0.0.1` e si aggiunge una route reverse-proxy `/<nome>/*` dentro
`thinkcentre-agent/server.js`, che è già pubblico su `tc.biker-link.net`.

**Why:** l'agente ha solo il tunnel token, non l'API key Cloudflare → non può
creare hostname/ingress (vedi thinkcentre-exposure-reality.md). Il
`thinkcentre-agent` invece è già dietro CF Access + verifica `X-Agent-Token`, e
il suo host è già instradato dal tunnel. Proxando da lì si riusa
l'autenticazione esistente a costo zero.

**How to apply:**
- Servizio a valle: bind `127.0.0.1:<porta>`, nessuna auth propria (la applica
  l'agente/edge). pm2 per boot+restart (come `bikerlink-agent`).
- Nell'agente: l'auth check `X-Agent-Token` gira PRIMA del routing, poi
  `http.request` verso `http://127.0.0.1:<porta>` con `req.pipe`/`res` pipe;
  su ECONNREFUSED/timeout rispondi 503 JSON (fail-soft, niente crash).
- Lato backend: client `fail-soft` che ritorna `null` se irraggiungibile
  (env `<SVC>_SERVICE_URL` = `https://tc.biker-link.net/<nome>`, header
  `X-Agent-Token` = `THINKCENTRE_AGENT_TOKEN` + `cfAccessHeaders()`).
- Primo esempio concreto: Kalman filter service (`infra/self-host/kalman/`,
  proxy `/kalman/*`, client `server/services/kalman-client.ts`).
