# ThinkCentre — Security Guide (post-Cloudflare)

> Guida completa all'hardening del ThinkCentre da applicare **dopo** che Cloudflare è operativo.
> Copre: scelta Cloudflare Tunnel vs DNS proxy, ufw, fail2ban, SSH hardening, Cloudflare Access, aggiornamenti automatici.

---

## Indice

1. [Scelta Cloudflare: Tunnel vs DNS Proxy](#1-scelta-cloudflare-tunnel-vs-dns-proxy)
2. [ufw — Firewall aggiornato per Cloudflare](#2-ufw--firewall-aggiornato-per-cloudflare)
3. [fail2ban — Protezione SSH brute-force](#3-fail2ban--protezione-ssh-brute-force)
4. [SSH Hardening](#4-ssh-hardening)
5. [Cloudflare Access — Zero Trust per /admin](#5-cloudflare-access--zero-trust-per-admin)
6. [Aggiornamenti automatici — unattended-upgrades](#6-aggiornamenti-automatici--unattended-upgrades)
7. [Verifica stato di ogni layer](#7-verifica-stato-di-ogni-layer)
8. [Come aggiungere eccezioni future](#8-come-aggiungere-eccezioni-future)

---

## 1. Scelta Cloudflare: Tunnel vs DNS Proxy

### Confronto

| Criterio | Cloudflare Tunnel | DNS Proxy (standard) |
|---|---|---|
| Porte aperte sul router | **Nessuna** (connessione uscente) | 80 e 443 |
| Sicurezza | ✅ Superiore | ⚠️ Buona se ufw corretto |
| Complessità setup | Media (daemon `cloudflared`) | Bassa |
| ufw | Blocca 80/443 da internet | Accetta 80/443 solo da IP Cloudflare |
| Latenza | Leggermente superiore | Diretta |
| Fallback se Cloudflare down | Nessuno | Nessuno (uguale) |

### **Scelta raccomandata: Cloudflare Tunnel** ✅

**Motivo**: zero porte aperte verso internet sul router. Il `cloudflared` daemon apre una connessione uscente verso i server Cloudflare — non c'è nulla da filtrare in entrata. Riduce la superficie di attacco anche in caso di errori di configurazione ufw.

Il setup di `cloudflared` è documentato in `docs/uptime-kuma-cloudflare-tunnel.md` (sezioni 4-6 — replicare per ogni servizio aggiuntivo).

---

## 2. ufw — Firewall aggiornato per Cloudflare

`scripts/setup-ufw-thinkcentre.sh` supporta tre modalità tramite l'argomento `--mode`:

| Modalità | Comando | Quando usare |
|---|---|---|
| Cloudflare Tunnel | `--mode tunnel` | **Raccomandato** — zero porte internet |
| DNS Proxy | `--mode dns-proxy` | Se si preferisce il proxy DNS standard |
| Legacy (nessun flag) | *(nessun --mode)* | Solo pre-Cloudflare, per test iniziali |

Il flag `--ssh-port` specifica la porta SSH da aprire in ufw (default: 22; usare 2222 dopo l'hardening):

### Cloudflare Tunnel (raccomandato)

Con Tunnel, `cloudflared` parla con nginx via loopback — nessuna porta 80/443 da aprire verso internet. Il loopback è già aperto dalla regola `allow in on lo`.

```bash
# Dopo aver completato l'hardening SSH (porta 2222):
sudo bash scripts/setup-ufw-thinkcentre.sh --mode tunnel --ssh-port 2222

# Prima dell'hardening SSH (porta 22 ancora):
sudo bash scripts/setup-ufw-thinkcentre.sh --mode tunnel --ssh-port 22
```

### DNS Proxy standard

Accetta 80/443 solo dagli IP Cloudflare (lista integrata nello script, aggiornabile trimestralmente da `https://www.cloudflare.com/ips-v4`):

```bash
sudo bash scripts/setup-ufw-thinkcentre.sh --mode dns-proxy --ssh-port 2222
```

> **Nota**: la lista IP Cloudflare è integrata nello script. Aggiornare trimestralmente se si usa questa modalità.

---

## 3. fail2ban — Protezione SSH brute-force

### Setup

```bash
# Eseguire DOPO setup-ssh-hardening-thinkcentre.sh (porta SSH: 2222)
sudo bash scripts/setup-fail2ban-thinkcentre.sh

# Se SSH è ancora sulla porta 22 (prima dell'hardening):
sudo bash scripts/setup-fail2ban-thinkcentre.sh --ssh-port 22
```

Lo script scrive automaticamente la porta corretta in `/etc/fail2ban/jail.local`, eliminando il rischio di drift tra porta SSH e porta monitorata da fail2ban.

### Configurazione applicata

| Parametro | Valore |
|---|---|
| Tentativi prima del ban | 5 |
| Finestra osservazione | 10 minuti |
| Durata ban | 1 ora |
| Whitelist | 192.168.1.0/24 + 127.0.0.1 (mai bannare LAN) |
| Porta SSH (default) | 2222 (allineata con `setup-ssh-hardening-thinkcentre.sh`) |
| Log sorgente | `/var/log/auth.log` |

### Verifica stato

```bash
sudo fail2ban-client status sshd
sudo journalctl -u fail2ban -f
```

### Sblocco manuale di un IP

```bash
sudo fail2ban-client set sshd unbanip <IP>
```

### Aggiornare la porta dopo SSH hardening

Se la porta SSH è stata spostata (es. 2222), aggiornare `/etc/fail2ban/jail.local`:

```ini
[sshd]
port = 2222
```

Poi: `sudo systemctl restart fail2ban`

---

## 4. SSH Hardening

### Setup

> ⚠️ **Prerequisito**: verificare che la propria chiave SSH pubblica sia già in `~/.ssh/authorized_keys` sul ThinkCentre prima di eseguire lo script. Altrimenti si perde l'accesso.

```bash
# Test chiave prima di procedere:
ssh -i ~/.ssh/id_rsa utente@192.168.1.35

# Solo se il test funziona:
sudo bash scripts/setup-ssh-hardening-thinkcentre.sh
```

### Hardening applicato

| Parametro sshd | Valore | Motivo |
|---|---|---|
| `PasswordAuthentication` | `no` | Solo chiave SSH |
| `PermitRootLogin` | `no` | Nessun login diretto root |
| `Port` | `2222` | Porta non standard (riduce rumore nei log) |
| `MaxAuthTries` | `3` | Blocca velocemente i tentativi |
| `LoginGraceTime` | `20` | Chiude connessioni lente/bot |
| `X11Forwarding` | `no` | Non necessario |
| `AllowTcpForwarding` | `no` | Riduce superficie di attacco |

### Connessione dopo l'hardening

```bash
ssh -p 2222 utente@192.168.1.35
# oppure aggiungere in ~/.ssh/config locale:
# Host thinkcentre
#   HostName 192.168.1.35
#   Port 2222
#   User utente
#   IdentityFile ~/.ssh/id_rsa
```

### Azioni post-script (obbligatorie)

1. **Aggiornare ufw** per la nuova porta SSH:
   ```bash
   sudo ufw delete limit from 192.168.1.0/24 to any port 22 proto tcp
   sudo ufw limit from 192.168.1.0/24 to any port 2222 proto tcp
   sudo ufw status verbose
   ```

2. **Aggiornare fail2ban** per la nuova porta:
   ```bash
   # Editare /etc/fail2ban/jail.local → port = 2222
   sudo systemctl restart fail2ban
   ```

---

## 5. Cloudflare Access — Zero Trust per /admin

### Cosa fa

Cloudflare Access intercetta le richieste ai path protetti **prima** che raggiungano nginx. Chi non è autenticato riceve un 403 (o redirect al login) direttamente da Cloudflare — il server non viene nemmeno toccato.

### Configurazione (Cloudflare Dashboard)

1. **Accedere a** [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → *Access* → *Applications*

2. **Creare una nuova Application** → tipo: *Self-hosted*

3. **Configurazione applicazione**:

   | Campo | Valore |
   |---|---|
   | Application name | `BikerLink Admin` |
   | Session duration | `24 hours` |
   | Application domain | `<tuo-dominio>/admin*` |

4. **Aggiungere un secondo hostname** per le API admin:

   | Campo | Valore |
   |---|---|
   | Application domain | `<tuo-dominio>/api/admin*` |

5. **Creare una Policy**:

   | Campo | Valore |
   |---|---|
   | Policy name | `Admin team only` |
   | Action | `Allow` |
   | Include → Login Methods | `Google` o `GitHub` |
   | Include → Emails | `tua-email@gmail.com` (whitelist esplicita) |

6. **Salvare** — Access è attivo immediatamente.

### Verifica

Aprire una finestra in incognito e navigare su `https://<dominio>/admin` — deve apparire il login Cloudflare Access prima della pagina admin.

### Note importanti

- Cloudflare Access funziona **solo se il dominio passa per Cloudflare** (DNS proxy o Tunnel attivo).
- Per test dalla LAN diretta (192.168.1.35), Access viene bypassato — è il comportamento corretto (accesso interno sempre disponibile).
- I path protetti devono corrispondere esattamente: `/admin*` copre `/admin`, `/admin/`, `/admin/users`, ecc.

---

## 6. Aggiornamenti automatici — unattended-upgrades

### Setup

```bash
sudo bash scripts/setup-unattended-upgrades-thinkcentre.sh
```

### Configurazione applicata

| Parametro | Valore |
|---|---|
| Sorgente aggiornamenti | Ubuntu security patches only |
| Pacchetti esclusi (blacklist) | `docker*`, `containerd*`, `nginx`, `postgresql*` |
| Rimozione pacchetti obsoleti | Sì |
| Riavvio automatico se necessario | Sì, ore 03:00 |

> **Perché escludere docker/nginx/postgresql?** Aggiornamenti di questi servizi possono richiedere riavvii manuali e verifiche. Si aggiornano manualmente in finestre di manutenzione pianificate.

### Verifica

```bash
sudo systemctl status unattended-upgrades
sudo unattended-upgrades --dry-run
cat /var/log/unattended-upgrades/unattended-upgrades.log
```

---

## 7. Verifica stato di ogni layer

### Script di verifica automatica

```bash
sudo bash scripts/check-thinkcentre-security.sh
```

Lo script controlla tutti i layer e produce un riepilogo OK/WARN/FAIL. Exit code: 0 = tutto OK, 1 = WARN, 2 = FAIL.

### Checklist manuale

```bash
# 1. ufw
sudo ufw status verbose

# 2. fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd

# 3. SSH
sudo sshd -T | grep -E "^(port|passwordauthentication|permitrootlogin|maxauthtries)"

# 4. unattended-upgrades
sudo systemctl is-active unattended-upgrades
sudo unattended-upgrades --dry-run 2>&1 | head -20

# 5. ufw-status daemon (pannello admin)
curl -s http://localhost:9099/
systemctl status bikerlink-ufw-status

# 6. Cloudflare Access
# Verificare manualmente da browser in incognito: https://<dominio>/admin
```

### Stato atteso

| Layer | Comando | Output atteso |
|---|---|---|
| ufw | `sudo ufw status` | `Status: active` |
| fail2ban | `sudo fail2ban-client status` | `Number of jail: 1` (sshd) |
| SSH porta | `sudo sshd -T \| grep ^port` | `port 2222` |
| SSH password | `sudo sshd -T \| grep passwordauth` | `passwordauthentication no` |
| unattended-upgrades | `systemctl is-active unattended-upgrades` | `active` |
| ufw daemon | `curl -s http://localhost:9099/` | `{"status":"active",...}` |

---

## 8. Come aggiungere eccezioni future

### Aprire una porta in ufw

```bash
# Porta per LAN (es. nuovo servizio interno)
sudo ufw allow from 192.168.1.0/24 to any port <PORTA> proto tcp

# Porta solo localhost (es. nuovo daemon)
sudo ufw allow from 127.0.0.1 to any port <PORTA> proto tcp

# Verificare
sudo ufw status verbose
```

Poi aggiornare anche `scripts/setup-ufw-thinkcentre.sh` per mantenere lo script idempotente.

### Sbannare un IP da fail2ban

```bash
sudo fail2ban-client set sshd unbanip <IP>
```

### Aggiungere un path protetto in Cloudflare Access

Cloudflare Dashboard → *Zero Trust* → *Access* → *Applications* → selezionare `BikerLink Admin` → aggiungere hostname o path aggiuntivo.

### Aggiornare la blacklist unattended-upgrades

Editare `/etc/apt/apt.conf.d/50unattended-upgrades`, sezione `Package-Blacklist`, e aggiungere il nuovo pacchetto.

---

## Riferimenti

| Documento | Contenuto |
|---|---|
| `docs/thinkcentre-server-setup.md` | Setup base ufw, servizi, porte |
| `docs/uptime-kuma-cloudflare-tunnel.md` | Setup Cloudflare Tunnel completo |
| `scripts/setup-ufw-thinkcentre.sh` | Firewall ufw — `--mode tunnel\|dns-proxy`, `--ssh-port` |
| `scripts/setup-fail2ban-thinkcentre.sh` | fail2ban SSH — `--ssh-port` (default 2222) |
| `scripts/setup-ssh-hardening-thinkcentre.sh` | SSH hardening (porta 2222, no password) |
| `scripts/setup-unattended-upgrades-thinkcentre.sh` | Patch di sicurezza automatiche Ubuntu |
| `scripts/check-thinkcentre-security.sh` | Verifica stato tutti i layer (OK/WARN/FAIL) |
