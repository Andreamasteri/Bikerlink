---
name: nginx ThinkCentre listen — catch-all vs IP specifico
description: Strategia listen nginx sul ThinkCentre: catch-all (0.0.0.0) per supportare sia eth (192.168.1.35) sia WiFi USB (192.168.1.36).
---

# nginx ThinkCentre — listen 443 ssl (catch-all 0.0.0.0)

## Regola attuale (dal Giugno 2026)
Tutti i `server` block su porta 443 in `/etc/nginx/sites-available/bikerlink` usano:
```nginx
listen 443 ssl;
listen [::]:443 ssl;
```
Forma catch-all (0.0.0.0) — nginx risponde su **qualsiasi interfaccia attiva**: eth cablata (192.168.1.35) e adattatore WiFi USB (192.168.1.36).

**Why:** Il ThinkCentre ha due NIC:
- `enp0s31f6` → 192.168.1.35 (ethernet cablata, principale)
- `wlxccbabdb51e2e` → 192.168.1.36 (WiFi USB, backup/ridondanza)

Con IP-specifico `listen 192.168.1.35:443 ssl`, nginx non risponde mai su 192.168.1.36. Catch-all copre entrambe senza hardcodare IP, e sopravvive anche se il disco viene spostato su un altro PC.

**How to apply:** Quando aggiungi un nuovo service block, usa sempre `listen 443 ssl;` + `listen [::]:443 ssl;`. Non usare `listen 192.168.1.35:443 ssl;`.

## Storia
- Prima del Giugno 2026: si usava `listen 192.168.1.35:443 ssl` (IP specifico). Motivo: conflict con Tailscale su [::]:443. Il conflict è stato risolto e IPv6 riabilitato.
- Giugno 2026: migrazione a catch-all per supportare WiFi USB e portabilità del disco.

## WiFi USB — setup profilo NM
L'adattatore `wlxccbabdb51e2e` (MAC cc:ba:bd:b5:1e:2e) deve essere configurato via NetworkManager:
```bash
sudo ./infra/self-host/expose/setup-wifi-usb.sh
# oppure:
WIFI_SSID="..." WIFI_PASSWORD="..." sudo -E ./setup-wifi-usb.sh
```
Profilo: `BikerLink-WiFi`, IP statico 192.168.1.36, autoconnect=yes, route-metric=200 (subordinato a eth).

## ATTENZIONE — sites-available vs sites-enabled
I due file sul ThinkCentre sono distinti (non symlink). Modificare sempre `sites-available/bikerlink` tramite `setup-expose.sh`, poi `sudo cp generated/nginx-bikerlink.conf /etc/nginx/sites-available/bikerlink`. Riapplicare anche a `sites-enabled/bikerlink` se è un file separato (verificare con `ls -la /etc/nginx/sites-enabled/`).

## Template e rigenerazione
Il template è in `infra/self-host/expose/nginx-bikerlink.conf`. Per rigenerare:
```bash
NONINTERACTIVE=1 BASE_DOMAIN=bikerlink.duckdns.org APP_ORIGIN=https://bikerlink.app \
ENV_LOCAL_FILE=/tmp/.env.local bash infra/self-host/expose/setup-expose.sh
```
I token vengono scritti in `/tmp/.env.local` via SFTP (mai loggati), poi cancellati dopo la generazione.
