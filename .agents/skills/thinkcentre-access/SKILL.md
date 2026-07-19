---
name: thinkcentre-access
description: Accedere in modo autonomo al ThinkCentre (server di casa BikerLink) per controllare e gestire i servizi self-hosted (GraphHopper, Valhalla, Ollama, Nominatim, Whisper, Redis/DragonflyDB). Le credenziali SSH sono GIA' nei secret dell'environment. Usa questa skill ogni volta che devi controllare lo stato, riavviare o accendere/spegnere un servizio sul ThinkCentre, diagnosticare routing/Valhalla/GraphHopper giù, o leggere CPU/RAM/uptime del mini-PC. NON chiedere mai le credenziali all'utente.
---

# ThinkCentre Access

Il "ThinkCentre" / "server di casa" è il mini-PC che ospita i servizi self-hosted di BikerLink. Le credenziali sono **già nei secret** dell'environment Replit — usale direttamente, non chiederle.

## Procedura snella (SSH)

Tutto passa dall'helper `tc.py` in questa cartella. È già testato e funzionante.

```bash
# Stato completo (uptime, RAM, tutti i container docker, ollama, tunnel)
python3 .agents/skills/thinkcentre-access/tc.py status

# Comando arbitrario
python3 .agents/skills/thinkcentre-access/tc.py exec "docker ps -a"

# Comando con sudo (la password arriva da env via stdin, mai nei log)
python3 .agents/skills/thinkcentre-access/tc.py exec "systemctl restart whisper" --sudo
```

`tc.py` non usa più `paramiko`: si appoggia al binario `ssh` di sistema con `cloudflared` come ProxyCommand. `cloudflared` viene risolto da `bin/cloudflared` del repo, poi dal PATH, e in ultima istanza scaricato on-demand in una dir temporanea (rimossa a fine sessione).

### Come funziona l'accesso SSH (Cloudflare Access — NON porta 22 diretta)
Il ThinkCentre è dietro **Cloudflare Tunnel + Cloudflare Access**: non accetta connessioni SSH dirette sulla porta 22 né via password. `tc.py` si connette così:

```bash
ssh -i <chiave-privata> \
    -o ProxyCommand="cloudflared access ssh --hostname %h" \
    "$TC_SSH_USER@$TC_SSH_HOST" '<comando>'
```

- `TC_SSH_HOST` = **`ssh.biker-link.net`** (hostname SSH del tunnel). ⚠️ NON usare `tc.biker-link.net`: quell'hostname non è instradato come SSH e `cloudflared access ssh` fallisce con `websocket: bad handshake`. `tc.py` strippa comunque un eventuale prefisso `Https://`.
- `TC_SSH_USER` = utente con sudo passwordless (`andrea`). `--sudo` usa `sudo -n` (non interattivo).
- `TC_SSH_KEY` = chiave **privata** OpenSSH. Il paste nell'UI secret spesso collassa i newline in spazi: `tc.py` la **ricostruisce** automaticamente (riavvolge il corpo base64 a 64 colonne) e la scrive in un file temporaneo `0600` cancellato a fine sessione.
- `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` = service token Cloudflare Access, passati a `cloudflared` via `TUNNEL_SERVICE_TOKEN_ID/SECRET`.

NON usare l'IP LAN `192.168.1.35` né nomi Tailscale: non sono risolvibili dalla sandbox Replit.

## Inventario servizi

| Servizio | Come gira | Comando gestione |
|---|---|---|
| **Valhalla** | Docker | `docker restart bikerlink-valhalla` (vedi nota sotto) |
| **GraphHopper** ×7 aree | Docker | `docker start/stop bikerlink-gh-<area>` |
| **Nominatim** | Docker | `docker start/stop bikerlink-nominatim` |
| **Whisper** | Docker + watchdog systemd | `sudo systemctl restart whisper` |
| **DragonflyDB (Redis)** | Docker | `docker start/stop bikerlink-dragonfly` |
| **Ollama** | systemd (NON docker) | `sudo systemctl start/stop/status ollama` |
| **Cloudflared (tunnel)** | systemd | `sudo systemctl restart cloudflared` |

Aree GraphHopper: `grecia, balcani, est, iberia, arco-alpino, germania-centro, francia-benelux`.

### Nota Valhalla (502 anche se "Up")
Esistono due container: `bikerlink-valhalla` (motore) e `bikerlink-valhalla-serve`. Se l'endpoint dà `502` mentre `bikerlink-valhalla` è `Up`, è il container **-serve** a essere fermo (`Created`). Avvialo: `docker start bikerlink-valhalla-serve`. Script pronto sul box: `scripts/thinkcentre/valhalla-fix.sh` (qui nel repo, da copiare/eseguire sul TC).

## Check rapido SENZA SSH (probe HTTP con auth)

Per un controllo veloce di routing puoi usare gli URL pubblici dalla sandbox (env già impostate). **Attenzione al gate auth**: senza token GraphHopper risponde `401` dal gate nginx (NON prova che il container sia su). Passa sempre il token:

```bash
# GraphHopper area (200=su, 502=spento, 401=manca token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer ${GRAPHHOPPER_TOKEN}" "${GRAPHHOPPER_URL}/areas/grecia/info"
# Valhalla (200=su, 502=giù) — nessun gate auth
curl -s -o /dev/null -w "%{http_code}\n" "${VALHALLA_URL}/status"
```

### Tabella header per-servizio TC (probe auth parity)

Ogni servizio TC usa un header custom diverso — **NON** `Authorization: Bearer` generico. Usare l'header sbagliato dà `401` anche con le credenziali giuste:

| Servizio | Header auth richiesto | Secret |
|----------|-----------------------|--------|
| GraphHopper | `X-GH-Token: $GRAPHHOPPER_TOKEN` | `GRAPHHOPPER_TOKEN` |
| Valhalla | `X-Valhalla-Key: $VALHALLA_API_KEY` | `VALHALLA_API_KEY` |
| Photon | `X-Photon-Token: $PHOTON_TOKEN` | `PHOTON_TOKEN` |
| Whisper | `X-Whisper-Token: $WHISPER_TOKEN` | `WHISPER_TOKEN` |
| Ollama (raw) | `X-Ollama-Token: $HORUS_OLLAMA_TOKEN` | `HORUS_OLLAMA_TOKEN` |
| TC-agent | `X-Agent-Token: $THINKCENTRE_AGENT_TOKEN` | `THINKCENTRE_AGENT_TOKEN` |

Tutti i servizi TC esposti via CF tunnel richiedono anche i due header Cloudflare Access:
```
CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID
CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET
```

> Per le chiamate Ollama (Horus/Bowie) usa sempre lo script canonico `ai_call_horus` / `ai_call_tc_agent` da `scripts/ai-agent-access.sh` — gestisce già tutti gli header in modo corretto.

### ⚠️ Avviso cold-boot secret

Un secret **appena aggiunto o modificato nel valore** non appare in ShellExec/CodeExecution finché il workflow non viene riavviato ("Start Backend"). Un secret **nuovo** entra subito; un secret con **valore modificato** richiede cold boot/restart.

Verifica sempre dopo un restart:
```bash
echo "$TC_SSH_KEY" | wc -c         # deve essere > 100
echo "$CF_ACCESS_CLIENT_ID" | wc -c # deve essere > 5
```

## Ares (PC fisso, Ollama diagnostica/studio `DIAG_OLLAMA_*`)

Ares è una macchina SEPARATA dal ThinkCentre, sulla **stessa LAN**. È in
**migrazione da Windows a Linux server headless** (Task #5259): runbook e script
idempotenti in `scripts/thinkcentre/ares/` (`MIGRATION.md`). Su Linux l'OS occupa
~1 GB, liberando i ~31 GB di RAM per tenere un 32B Q4 in RAM senza swap.

### Accesso SSH (ProxyJump via ThinkCentre)
Ares è **LAN-only**: dalla sandbox Replit ci si arriva SOLO saltando dal TC.
Helper dedicato (analogo a `tc.py`):

```bash
python3 scripts/thinkcentre/ares/ares.py status
python3 scripts/thinkcentre/ares/ares.py exec "free -h && ollama ps"
python3 scripts/thinkcentre/ares/ares.py ip       # risolve l'IP LAN di Ares
```

- Chiave **privata** dell'agente nel secret `ARES_SSH_KEY`; pubblica incorporata <!-- pragma: allowlist secret -->
  in `ares-bootstrap.sh`. Utente SSH: `ares-agent`.
- IP di Ares è **dinamico**: `ares.py` lo risolve dalla neighbor table del TC via
  MAC, oppure passa `ARES_LAN_IP=<ip>`.

### Wake-on-LAN remoto
Comanda il ThinkCentre (stessa LAN, sempre online) via SSH:

```bash
python3 .agents/skills/thinkcentre-access/tc.py exec "bash ~/scripts/wake-ares.sh"
```

- **MAC di Ares**: `A8:E2:91:2C:90:6A` — **invariato** dopo la migrazione, quindi
  `wake-ares.sh` continua a funzionare. IP dinamico, sveglia via broadcast WoL su
  `192.168.1.255`, non IP diretto.
- Lo script (`~/scripts/wake-ares.sh` sul TC, sorgente `scripts/thinkcentre/wake-ares.sh`)
  costruisce e invia il magic packet con **python3 puro** — niente `wakeonlan`/`etherwake`.
- Alias sul TC: `wake-ares` (in `~/.bashrc`).
- Su Linux il WoL è reso persistente da `ares-wol.sh` (`ethtool ... wol g` + systemd unit).
- **WoL su WiFi richiede Sleep/Standby**, non Shutdown/Hibernate (la NIC WiFi perde
  alimentazione). Verificato: Ares compare nella ARP del TC pochi secondi dopo il pacchetto.

## Secret usati (già presenti, non chiederli)
`TC_SSH_HOST` (=`ssh.biker-link.net`), `TC_SSH_USER`, `TC_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (SSH via Cloudflare Access — `TC_SSH_PASSWORD` NON è più usato) · `GRAPHHOPPER_URL`/`GRAPHHOPPER_TOKEN`, `VALHALLA_URL`/`VALHALLA_API_KEY`, `OLLAMA_URL`/`OLLAMA_TOKEN`, `THINKCENTRE_METRICS_URL`/`THINKCENTRE_AGENT_TOKEN` (HTTP). Non stamparne mai i valori.
