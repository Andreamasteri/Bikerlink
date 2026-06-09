---
name: nginx ThinkCentre listen IP specifico
description: Perché i server block nginx sul ThinkCentre devono usare l'IP LAN esplicito e non 0.0.0.0
---

# nginx ThinkCentre — listen deve usare 192.168.1.35:443

## Regola
Ogni `server` block su porta 443 nel config nginx del ThinkCentre DEVE usare:
```nginx
listen 192.168.1.35:443 ssl;
```
NON `listen 443 ssl;` (che diventa 0.0.0.0:443).

**Why:** Quando il router forwarda la porta pubblica 443 → 192.168.1.35:443, il kernel OS instrada la connessione al socket più specifico. Se esistono sia un socket `192.168.1.35:443` che uno `0.0.0.0:443`, tutte le connessioni esterne vanno al socket specifico (192.168.1.35:443). Un server block su `0.0.0.0:443` non riceve MAI quelle connessioni — nginx non controlla nemmeno il suo `server_name` per queste.

**How to apply:** Quando aggiungi un nuovo servizio al ThinkCentre (es. un nuovo agent, un nuovo tool), copia la riga `listen` dagli altri block esistenti (`listen 192.168.1.35:443 ssl;`). NON usare il form generico `listen 443 ssl;`. Rimuovi anche `listen [::]:443 ssl;` (IPv6) — non necessario per servizi esposti solo via DuckDNS/IPv4.

## Sintomo del problema
- `nginx -T | grep -c "listen 443"` mostra solo 1 o 2 entry invece del numero atteso
- Il nuovo subdomain risponde con il contenuto di un servizio diverso (es. GraphHopper) invece del servizio target
- `tail /var/log/nginx/<nuovo-service>-access.log` è vuoto — il block non riceve traffico
- Il cert SSL servito è CORRETTO (SNI matching funziona a livello TLS) ma il contenuto HTTP è sbagliato

## Diagnosi rapida
```bash
sudo grep -n "^    listen" /etc/nginx/sites-enabled/bikerlink | head -20
# Tutti devono mostrare: listen 192.168.1.35:443 ssl;
```

## ATTENZIONE — due file distinti sul ThinkCentre
`/etc/nginx/sites-available/bikerlink` e `/etc/nginx/sites-enabled/bikerlink` sono file **separati** (non symlink). Il blocco TC agent (`upstream tc_agent_backend` + `server_name tc.bikerlink.duckdns.org`) si trova **solo** in `sites-enabled/bikerlink` (≈ riga 530). Per editare la porta del TC agent occorre modificare `sites-enabled/bikerlink`, non `sites-available`.

Fix applicato (Giugno 2026): `tc_agent_backend` puntava a `127.0.0.1:9101` (Bacula Director) — corretto a `127.0.0.1:9199` con:
```bash
sudo sed -i 's/server 127\.0\.0\.1:9101;/server 127.0.0.1:9199;/' /etc/nginx/sites-enabled/bikerlink && sudo nginx -t && sudo systemctl reload nginx
```
