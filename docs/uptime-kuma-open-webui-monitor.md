# Uptime Kuma — Monitor Open WebUI (Bowie)

> Runbook operativo per il monitor HTTP che rileva quando Open WebUI (Bowie) va offline.
> Riproduce la configurazione applicata automaticamente da Task #5224.

---

## Stato attuale

| Campo | Valore |
|---|---|
| **Monitor name** | Open WebUI (Bowie) |
| **URL** | `http://172.19.0.1:3010` |
| **Tipo** | HTTP(s) |
| **Intervallo** | 60 secondi |
| **Metodo** | GET |
| **Accepted status codes** | 200–299 |
| **Notifica** | Email (Gmail) — `BikerLinkApp@gmail.com` |
| **Container Uptime Kuma** | `bikerlink-uptime-kuma` (porta 3001, solo localhost) |

---

## Perché `172.19.0.1` e non `127.0.0.1`

Open WebUI gira con **`--network host`** sulla porta 3010 del ThinkCentre.
Uptime Kuma gira in un container Docker (network bridge `bikerlink-selfhost_default`).
Dal punto di vista del container, `127.0.0.1` è la sua loopback — non l'host.
Il gateway del network Docker è `172.19.0.1`, che corrisponde all'interfaccia host
visibile dal container.

Per permettere la connessione, è stata aggiunta questa regola UFW sull'host:

```bash
sudo ufw allow from 172.19.0.0/24 to any port 3010 proto tcp comment 'Uptime Kuma -> Open WebUI'
```

Se il ThinkCentre viene reinstallato, questa regola va rieseguita.

---

## Riprodurre la configurazione (da zero)

### Prerequisiti

- `bikerlink-uptime-kuma` in esecuzione (`docker compose up -d uptime-kuma`)
- Open WebUI in esecuzione (`docker start open-webui` o via systemd)

### 1. Verifica UFW

```bash
sudo ufw status numbered | grep 3010
# Atteso: ALLOW IN 172.19.0.0/24
```

Se manca:
```bash
sudo ufw allow from 172.19.0.0/24 to any port 3010 proto tcp comment 'Uptime Kuma -> Open WebUI'
```

### 2. Test connettività dal container

```bash
docker exec bikerlink-uptime-kuma sh -c \
  'curl -s -o /dev/null -w "%{http_code}" http://172.19.0.1:3010'
# Atteso: 200
```

### 3. Pannello Uptime Kuma

Uptime Kuma è accessibile da `http://localhost:3001` sul ThinkCentre
(o via SSH tunnel: `ssh -L 3001:localhost:3001 andrea@<tc-host>`).

Credenziali admin: salvate nei secret Replit (`UPTIME_KUMA_ADMIN_*`).

Per aggiungere il monitor manualmente:

1. **Add New Monitor**
2. Type: `HTTP(s)`
3. Friendly Name: `Open WebUI (Bowie)`
4. URL: `http://172.19.0.1:3010`
5. Heartbeat Interval: `60`
6. Max Retries: `1`
7. Accepted Status Codes: `200-299`
8. Save

### 4. Notifiche email

Settings → Notifications → Add New Notification:

| Campo | Valore |
|---|---|
| Type | SMTP |
| Friendly Name | `Email BikerLink (Gmail)` |
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` |
| TLS | STARTTLS |
| Username | `BikerLinkApp@gmail.com` |
| Password | (da secret `GMAIL_APP_PASSWORD`) |
| From | `BikerLinkApp@gmail.com` |
| To | `BikerLinkApp@gmail.com` |
| Apply on all monitors | ✅ |

---

## Troubleshooting

### Monitor mostra ECONNREFUSED

La regola UFW è mancante o il subnet Docker è cambiato:

```bash
# Verifica subnet attuale
docker network inspect bikerlink-selfhost_default \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'

# Ri-aggiungi la regola con il gateway corretto
sudo ufw allow from <NUOVO_SUBNET>/24 to any port 3010 proto tcp
```

### Open WebUI non risponde su 3010

```bash
ss -tlnp | grep 3010
# Se vuoto, Open WebUI è spento
docker ps --filter name=open-webui --format '{{.Names}}: {{.Status}}'
docker start open-webui
```

### Container Uptime Kuma non parte

```bash
cd ~/bikerlink/infra/self-host
docker compose up -d uptime-kuma
docker compose ps uptime-kuma
```

---

## Accesso pubblico (da implementare)

Vedi task follow-up: esporre Uptime Kuma tramite Cloudflare Tunnel su `status.biker-link.net`.
Procedura: `docs/uptime-kuma-cloudflare-tunnel.md` → Sezione 8.
