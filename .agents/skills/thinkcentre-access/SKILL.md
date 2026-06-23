---
name: thinkcentre-access
description: Accedere in modo autonomo al ThinkCentre (server di casa BikerLink) per controllare e gestire i servizi self-hosted (GraphHopper, Valhalla, Ollama, Nominatim, Whisper, Postgres, Redis). Le credenziali SSH sono GIA' nei secret dell'environment. Usa questa skill ogni volta che devi controllare lo stato, riavviare o accendere/spegnere un servizio sul ThinkCentre, diagnosticare routing/Valhalla/GraphHopper giù, o leggere CPU/RAM/uptime del mini-PC. NON chiedere mai le credenziali all'utente.
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

Se `paramiko` manca: `installLanguagePackages('python3', 'paramiko')`.

### Perché il mio SSH a volte fallisce
`TC_SSH_HOST` contiene il prefisso `Https://` (l'host reale è il DuckDNS pubblico via Cloudflare tunnel). `tc.py` lo strippa già. Se ti connetti a mano: `os.environ["TC_SSH_HOST"].replace("Https://","").strip().rstrip("/")`. NON usare l'IP LAN `192.168.1.35` né nomi Tailscale: non sono risolvibili dalla sandbox Replit (`gaierror`).

## Inventario servizi

| Servizio | Come gira | Comando gestione |
|---|---|---|
| **Valhalla** | Docker | `docker restart bikerlink-valhalla` (vedi nota sotto) |
| **GraphHopper** ×7 aree | Docker | `docker start/stop bikerlink-gh-<area>` |
| **Nominatim** | Docker | `docker start/stop bikerlink-nominatim` |
| **Whisper** | Docker + watchdog systemd | `sudo systemctl restart whisper` |
| **Postgres / Redis / pgAdmin** | Docker | `docker start/stop bikerlink-<nome>` |
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

## Secret usati (già presenti, non chiederli)
`TC_SSH_HOST`, `TC_SSH_USER`, `TC_SSH_PASSWORD`, `TC_SSH_PORT`, `TC_SSH_KEY` (SSH) · `GRAPHHOPPER_URL`/`GRAPHHOPPER_TOKEN`, `VALHALLA_URL`/`VALHALLA_API_KEY`, `OLLAMA_URL`/`OLLAMA_TOKEN`, `THINKCENTRE_METRICS_URL`/`THINKCENTRE_AGENT_TOKEN` (HTTP). Non stamparne mai i valori.
