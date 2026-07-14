---
name: photon-tc
description: Gestire Photon self-hosted sul ThinkCentre BikerLink (geocoder che ha sostituito Nominatim). Usa questa skill quando l'utente dice "avvia photon", "stato photon", "controlla geocoding", "geocoding giù", o vuole verificare che il geocoding funzioni. Copre il contratto d'integrazione app↔Photon, la verifica di stato e il troubleshooting.
---

# Photon — ThinkCentre BikerLink

Photon è il geocoder self-hosted di BikerLink, che ha **sostituito Nominatim**.
Gira sul ThinkCentre ed è esposto via Cloudflare Tunnel + Cloudflare Access.

> ⚠️ Photon è **solo self-hosted**: nessun fallback pubblico (né `photon.komoot.io`
> né `nominatim.openstreetmap.org`). Se `PHOTON_URL`/`PHOTON_TOKEN` non sono
> configurati o il ThinkCentre è offline, il geocoding fallisce in modo esplicito.

## Contratto d'integrazione app ↔ Photon (verificato nel codice)

| Cosa | Valore |
|---|---|
| Deployment TC | systemd `photon.service`, Photon 1.2.1, `/home/andrea/photon`, bind `127.0.0.1:2322`, `-cors-any` |
| **Lingua** | ⚠️ questa build supporta SOLO `lang=default,de,en,fr` — **`lang=it` → HTTP 400**. Usa **`lang=default`** (nomi nativi = italiano per l'IT) |
| Cloudflare | ingress `photon.biker-link.net → 127.0.0.1:2322` + DNS CNAME + app CF Access con reusable service-token policy — **già cablato** (verificato 14-lug-2026) |
| Secret URL | `PHOTON_URL` (base del servizio, es. `https://photon.biker-link.net`) — shared env var, non secret |
| Secret token custom | `PHOTON_TOKEN` → header `X-Photon-Token` |
| Auth edge | Cloudflare Access Service Token (`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET`, via `cfAccessHeaders()`) |
| Endpoint geocode | `GET {PHOTON_URL}/api/?q=<query>&limit=<n>&lang=default` |
| Endpoint reverse | `GET {PHOTON_URL}/reverse?lat=<lat>&lon=<lon>&lang=default` |
| Formato risposta | GeoJSON — coordinate `[lon, lat]` (attenzione all'ordine) |
| Health check | **Photon non ha `/status`**: la salute si verifica con una query di geocoding leggera (`/api/?q=Roma&limit=1&lang=default`) |
| Client server | `server/lib/photon-client.ts` |
| Proxy diagnostica | `GET /api/routing/photon/search?q=<query>&limit=<n>` |

Photon **non** usa il parametro `zoom` (proprio di Nominatim); il reverse geocode
lo mantiene in firma per compatibilità con i chiamanti ma non lo invia.

## SSH sul ThinkCentre

Sempre via `tc.py`. Non usare mai IP LAN o Tailscale dalla sandbox Replit.

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "<comando>"
```

## Comandi frequenti

### Verifica stato container (adatta il nome reale del container Photon)
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker ps --filter name=photon --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### Verifica che il geocoding risponda (health = query leggera, NON /status)
Dal ThinkCentre, contro la porta locale del container Photon:
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "curl -fsS --max-time 5 'http://localhost:<PORTA_PHOTON>/api/?q=Roma&limit=1&lang=default' >/dev/null && echo 'PHOTON_OK' || echo 'DOWN_OR_STARTING'"
```
- `PHOTON_OK` = geocoding attivo
- `DOWN_OR_STARTING` = container fermo oppure indice non ancora pronto

### Verifica end-to-end dal backend app
Il proxy diagnostica passa per CF Access + `X-Photon-Token`:
```
GET /api/routing/photon/search?q=Roma&limit=1
→ 200 { results: [...] }   geocoding OK
→ 503 { error: "..." }     Photon non configurato o non raggiungibile
```
La diagnostica in-app usa lo stesso endpoint (test "Photon geocoding").

### Ultime righe di log
```bash
python3 .agents/skills/thinkcentre-access/tc.py exec \
  "docker logs --tail 20 <NOME_CONTAINER_PHOTON> 2>&1"
```

## Troubleshooting

**Geocoding giù nell'app ma il ThinkCentre è acceso**
- Verifica che `PHOTON_URL`/`PHOTON_TOKEN` siano configurati (secret Replit).
- Verifica CF Access: un Service Token errato 403a TUTTI i servizi TC insieme
  (vedi skill `thinkcentre-access` e le note memoria su CF Access).

**Health check fallisce solo su `/status`**
- Atteso: Photon **non espone `/status`**. Usa sempre una query `/api/?q=...`.

**Il container Photon non risponde**
- Log del container; verifica che l'indice Photon (derivato dai dati OSM) sia
  presente e completo — senza indice le query rispondono vuoto/errore.

> ⚠️ **Dettagli di deployment del container** (nome esatto, immagine, porta locale,
> procedura di build/import dell'indice) vanno **confermati contro il deployment
> reale sul ThinkCentre** prima di eseguire comandi distruttivi: non sono
> hardcodati in questo repo. Non assumere i vecchi valori di Nominatim.

## File di riferimento
- `server/lib/photon-client.ts` — client Photon-only (geocode/reverse, cache, auth, health snapshot)
- `server/routes/routing-areas.ts` — proxy diagnostica `/api/routing/photon/search`
- `server/lib/cf-access.ts` — header Cloudflare Access Service Token
