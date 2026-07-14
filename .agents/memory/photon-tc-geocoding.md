---
name: Photon TC geocoding (Nominatim replacement)
description: Photon self-hosted sul ThinkCentre — build language limitata, wiring Cloudflare, config env. Leggere prima di toccare il geocoding o diagnosticare 400/403 su Photon.
---

# Photon — geocoder self-hosted (ha sostituito Nominatim)

## Language caveat (la trappola vera)
Questa build di Photon (1.2.1, `/home/andrea/photon`, systemd `photon.service`,
bind `127.0.0.1:2322`, `-cors-any`) supporta SOLO `lang = default, de, en, fr`.
**`lang=it` → HTTP 400** (`Language is not supported`). Usare sempre **`lang=default`**:
restituisce i nomi locali/nativi (per l'Italia = italiano: "Roma", "Lazio", "Italia").
**Why:** l'indice Photon è stato importato senza l'italiano; aggiungere `it` richiede
un rebuild pesante dell'indice sul TC (out of scope). `default` copre il caso IT senza rebuild.
**How to apply:** ogni query Photon (forward `/api/?q=`, reverse `/reverse?`, health probe)
deve usare `lang=default`, mai `lang=it`.

## Config env
- `PHOTON_URL` = `https://photon.biker-link.net` → **shared env var** (come GRAPHHOPPER_URL/VALHALLA_URL/WHISPER_URL), NON secret.
- `PHOTON_TOKEN` = **opzionale**. `isConfigured = Boolean(PHOTON_URL)` (token non richiesto). Photon non ha auth propria e non c'è nginx/proxy davanti → **nessuno valida X-Photon-Token**; la vera auth è CF Access. Il client invia X-Photon-Token solo se PHOTON_TOKEN è settato (degrada pulito).
- Nessun fallback pubblico: se PHOTON_URL manca → errore esplicito.

## Cloudflare wiring (già presente — verificato 14-lug-2026)
Tutto già in dashboard sul tunnel `bikerlink-tc` (86122511-...):
- ingress `photon.biker-link.net → http://127.0.0.1:2322`
- DNS CNAME `photon` → `86122511-....cfargotunnel.com` (proxied)
- CF Access app "BikerLink TC - photon" (`photon.biker-link.net`, self_hosted) con la **reusable non_identity policy** `260f8223-b86a-41cf-9490-bc186842497d` (allow service token `d976f94d-...`) — la stessa di gh/valhalla/whisper.
Il backend Replit raggiunge il TC SOLO via questo hostname pubblico (LAN non raggiungibile). `photon-client.ts` `buildHeaders()` allega `cfAccessHeaders()` → passa l'edge CF.

**Why:** l'utente credeva Photon non cablato lato CF, ma ingress+DNS+Access+policy erano già tutti presenti; il 400 non era un 403 di CF ma un errore lingua di Photon. Diagnosi corretta = distinguere 400 (origin) da 403 (CF Access).

## Gestire il tunnel/DNS/Access via API
Serve un **CF API token** (secret `CF_API_TOKEN`) con Account→Cloudflare Tunnel:Edit,
Zone→DNS:Edit (zona `e2ced3f458b06555c6c8e8a403f4b489`), Account→Access Apps&Policies:Edit.
Il tunnel è token-managed (no config.yml locale, no cert.pem per la CLI): l'ingress si
legge/scrive su `GET|PUT /accounts/{acc}/cfd_tunnel/{tun}/configurations`. account=`d116d3d97b133c543d02934be4bc98d2`.
