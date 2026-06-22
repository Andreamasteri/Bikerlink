---
name: ThinkCentre SSH access
description: Come accedere via SSH al ThinkCentre per gestire servizi — credenziali in env, pattern paramiko, sudo.
---

Le credenziali SSH sono già presenti nell'environment Replit come variabili d'ambiente:
- `TC_SSH_HOST` — hostname (ha prefisso "Https://" da strippare: `.replace("Https://","").strip()`)
- `TC_SSH_USER` — utente linux (andrea)
- `TC_SSH_PASSWORD` — password SSH e sudo
- `TC_SSH_PORT` — porta SSH (22)

**Pattern paramiko standard:**
```python
import paramiko, os
host = os.environ["TC_SSH_HOST"].replace("Https://","").strip()
user = os.environ["TC_SSH_USER"]
pwd  = os.environ["TC_SSH_PASSWORD"]
port = int(os.environ.get("TC_SSH_PORT","22"))
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, port=port, username=user, password=pwd, timeout=15)
```

**Sudo senza terminale:** usare `echo '{pwd}' | sudo -S <cmd>` (flag -S legge password da stdin).

**Why:** L'utente ha confermato che le credenziali sono nell'environment e vuole che l'agente le usi direttamente senza cercarle ogni volta (22 giu 2026).

**How to apply:** Ogni volta che devo eseguire comandi sul ThinkCentre, usare direttamente queste env var senza chiedere all'utente. paramiko deve essere installato (`installLanguagePackages python3 paramiko`) se non disponibile.

**Servizi e come girano:**
- Ollama: systemd (`sudo systemctl stop/start/status ollama`) — NON Docker
- Nominatim, Whisper, GraphHopper (×7 aree), Postgres, Redis, Valhalla: Docker (`docker stop/start bikerlink-<nome>`)
- Script `thinkcentre-scripts/services.sh stop/start/status` per gestione bulk
