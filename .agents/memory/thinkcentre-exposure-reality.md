---
name: ThinkCentre exposure reality — Cloudflare tunnel, nginx legacy, Ollama 127.0.0.1
description: Come sono REALMENTE esposti i servizi del ThinkCentre (giugno 2026) — diverge dalla doc nginx/duckdns.
---

# ThinkCentre — esposizione reale dei servizi (giugno 2026)

La documentazione/skill descrivono nginx (duckdns) come reverse proxy attivo. **Non lo è più.**

## Fatti scoperti
- **nginx è `disabled` + `inactive`** sul TC. I server block duckdns in `/etc/nginx/sites-available/bikerlink` sono **legacy**.
- L'esposizione reale è il **Cloudflare Tunnel** (`cloudflared`, systemd, token-managed — NON c'è `/etc/cloudflared/config.yml`, le ingress rule stanno nella dashboard Cloudflare, fuori dalla portata dell'agente).
- Il dominio pubblico attivo è **`biker-link.net`** (non più `*.bikerlink.duckdns.org`). Es. `gh.biker-link.net`→`127.0.0.1:8989`, `valhalla.biker-link.net`→ dovrebbe puntare a `127.0.0.1:8002` (porta REALE in ascolto, verificato `ss -tlnp`/`docker ps`, container `bikerlink-valhalla` healthy). Il tunnel punta DIRETTO alle porte localhost dei backend, non a nginx:443.
- **Bug noto (30 giu 2026, non fixabile da repo):** l'ingress dashboard del tunnel per `valhalla.biker-link.net` dialga `127.0.0.1:8003` (verificato via `journalctl -u cloudflared`: `connection refused`), ma Valhalla ascolta SOLO su `8002` → endpoint pubblico rotto. Serve correggere l'ingress rule nella dashboard Cloudflare (fuori dal repo). I file repo (docker-compose, build-valhalla-tiles.sh, cloudflared-config.yml, nginx-bikerlink.conf) sono tutti allineati a 8002 dal task #5250.
- I cert Let's Encrypt (`/etc/letsencrypt/live/bikerlink`) sono **SAN** (gh/nominatim/ollama/tc/valhalla/whisper.bikerlink.duckdns.org), **non wildcard**; renewal `authenticator=standalone`.
- DNS dei `*.bikerlink.duckdns.org` risolve all'**IP pubblico** (no DNS locale/pihole sul TC), quindi sulla LAN quei hostname NON puntano a 192.168.1.35.

## Conseguenze pratiche
- **Per esporre un nuovo servizio via tunnel** servono modifiche nella dashboard Cloudflare → l'agente NON può farlo (ha solo il tunnel token, niente API key).
- **Per accesso LAN da browser** (es. PC Windows) la via affidabile è l'**IP LAN diretto** `192.168.1.35:<porta>`. Se serve HTTPS LAN si può (ri)avviare nginx con un server block su `192.168.1.35:<porta> ssl` riusando il cert SAN (avviso nome-cert su IP, normale per servizio interno). Avviare nginx è sicuro: i listen sono IP-specifici (`192.168.1.35`), non confliggono con Tailscale (`[::]:443`) né con cloudflared (porte localhost).

## Ollama bind
- Ollama (systemd) ascolta SOLO `127.0.0.1:11434` (`OLLAMA_HOST=127.0.0.1:11434`). **Non** è raggiungibile via `host.docker.internal`/bridge `172.17.0.1`. Un container che deve parlargli va lanciato con **`--network host`** (es. Open WebUI: `--network host -e PORT=3010 -e OLLAMA_BASE_URL=http://127.0.0.1:11434`). Modificare OLLAMA_HOST è spesso out-of-scope.

**Why:** ho perso tempo assumendo che nginx fosse il proxy attivo e che `--add-host=host.docker.internal` bastasse; entrambe le assunzioni erano false.
**How to apply:** prima di "aggiungere un blocco nginx" o usare host.docker.internal sul TC, verifica `systemctl is-active nginx`, `cloudflared` ingress (journal), e il bind di Ollama (`ss -tlnp | grep 11434`).
