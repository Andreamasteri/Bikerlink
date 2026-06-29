---
name: nginx ThinkCentre listen — IP specifico 192.168.1.35:443
description: Tutti i server block nginx sul ThinkCentre usano listen 192.168.1.35:443 ssl (IP specifico, non catch-all 0.0.0.0) per evitare conflitto con Tailscale.
---

# nginx ThinkCentre — listen 192.168.1.35:443 ssl (IP specifico)

## Regola attuale (Giugno 2026)
Tutti i `server` block su porta 443 usano IP specifico:
```nginx
listen 192.168.1.35:443 ssl;
```
Nessun `listen 443 ssl;` catch-all (0.0.0.0) né `listen [::]:443 ssl;`.

**Why:** Tailscale si lega su `[::]:443` e `100.x.x.x:443`. Se nginx usa `listen 443 ssl;` o `listen [::]:443 ssl;`, il bind 0.0.0.0:443 entra in conflitto con Tailscale e `systemctl restart nginx` fallisce (i vecchi worker sopravvivono con `reload` ma non con `restart`). Il bind su IP specifico (`192.168.1.35`, NIC ethernet cablata) garantisce che nginx ascolti sull'interfaccia LAN senza interferire con Tailscale.

**How to apply:** Ogni nuovo `server` block usa `listen 192.168.1.35:443 ssl;`. Per cambiare le listen sockets (aggiunta/rimozione IP), serve `systemctl restart nginx` (non `reload` — reload non rebinda socket già aperti).

## File nginx attivi sul ThinkCentre
- `/etc/nginx/sites-available/bikerlink` — file principale (26 KB); GH, Valhalla, Ollama, Whisper, Nominatim, TC agent
- `/etc/nginx/sites-enabled/bikerlink` — symlink a sites-available/bikerlink
- `/etc/nginx/sites-enabled/graphhopper` — file separato (NON symlink), legacy da Certbot; contiene block `bikerlink.duckdns.org` con cert LetsEncrypt (`/etc/letsencrypt/live/bikerlink.duckdns.org/`)
- `/etc/nginx/sites-available/graphhopper` — vecchio file HTTP-only (porta 80), non usato per 443
- `/etc/nginx/sites-available/tc-acme` — ACME challenge handler

## Attenzione — reload vs restart
- `systemctl reload nginx` → respawna i worker ma NON cambia i socket di ascolto del master process; se il listen IP cambia, il socket vecchio rimane aperto finché il master non viene riavviato.
- `systemctl restart nginx` → chiude tutti i socket e li riapre da zero secondo il config attuale. Serve dopo qualsiasi cambio di `listen` directive.

## Template e rigenerazione
Il template principale è in `infra/self-host/expose/nginx-bikerlink.conf` (repo) — già con `listen 192.168.1.35:443 ssl;`. Non esiste un template separato per graphhopper. Per rigenerare:
```bash
NONINTERACTIVE=1 BASE_DOMAIN=bikerlink.duckdns.org APP_ORIGIN=https://bikerlink.app \
ENV_LOCAL_FILE=/tmp/.env.local bash infra/self-host/expose/setup-expose.sh
```

## WiFi USB — nota
Il ThinkCentre ha una seconda NIC WiFi USB (`wlxccbabdb51e2e`, IP 192.168.1.36). Con listen IP-specifico, nginx NON risponde su 192.168.1.36. Se serve ridondanza WiFi per nginx, aggiungere un secondo `listen 192.168.1.36:443 ssl;` in ciascun server block — ma per ora non è necessario perché il routing primario è via ethernet.

## Storia
- Pre-Giugno 2026: IP specifico (`192.168.1.35`), poi conflitto Tailscale su `[::]:443`.
- Giugno 2026 (post-task): graphhopper site-enabled aveva ancora `listen 443 ssl;` (Certbot legacy) → 0.0.0.0:443 attivo; fixato con `sed` + `systemctl restart nginx`; ora `ss -tlnp | grep 443` mostra solo `192.168.1.35:443`.
