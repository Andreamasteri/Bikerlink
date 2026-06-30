# Archivio — stack di esposizione DuckDNS + nginx + Let's Encrypt (RITIRATO)

> ❌ **Non eseguire nessun file in questa cartella.**

Questi file appartengono al **vecchio** stack di esposizione del ThinkCentre
(DuckDNS per il DNS dinamico + nginx come reverse proxy/stream TLS + certbot per
i certificati Let's Encrypt). Sono stati **dismessi il 29 Giugno 2026** quando
l'esposizione è stata migrata interamente a **Cloudflare Tunnel** su
`*.biker-link.net`.

Sono conservati solo come riferimento storico (per capire com'era configurata la
vecchia infrastruttura). Per il setup attuale vedi:

- `../README.md` → Opzione A — Cloudflare Tunnel
- `../cloudflared-config.yml` → configurazione del tunnel (riferimento)
- `../DEPLOY-LOG.md` → log della disattivazione di DuckDNS+nginx+certbot
- `.agents/memory/thinkcentre-cloudflare-migration.md` → note sulla migrazione

## File archiviati

| File | Cosa faceva |
|---|---|
| `duckdns.service` / `duckdns.timer` | aggiornamento periodico dell'IP su DuckDNS |
| `duckdns-update.sh` | script di aggiornamento IP DuckDNS |
| `nginx-bikerlink.conf` | reverse proxy + stream TLS per i servizi self-host |
| `certbot-renew.service` / `certbot-renew.timer` | rinnovo certificati Let's Encrypt |
| `setup-expose.sh` | generava le config nginx/cloudflared per il vecchio setup |
| `setup-wifi-usb.sh` | esposizione su IP LAN via nginx (WiFi/USB tethering) |
| `test-connectivity.sh` | verifica DNS/TLS/auth + timer DuckDNS |
| `MIGRA-DA-TAILSCALE.md` | guida storica Tailscale → DuckDNS |
