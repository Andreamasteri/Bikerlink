# ThinkCentre Metrics Agent

Agente leggero da eseguire sul **ThinkCentre** (mini-PC di casa).  
Espone `GET /sys-metrics` con CPU load, RAM e uptime del sistema.

## Avvio

```bash
node index.js
# oppure con porta custom:
PORT=9101 node index.js
```

Richiede **Node.js ≥ 16** e Linux (`/proc` filesystem).

## Risposta

```json
{
  "cpu":    { "loadAvg1": 0.5, "loadAvg5": 0.3, "loadAvg15": 0.2, "cores": 4 },
  "memory": { "totalMb": 16384, "usedMb": 4096, "usedPercent": 25 },
  "uptimeSec": 86400
}
```

## Configurazione backend (Replit)

Imposta la variabile d'ambiente `THINKCENTRE_METRICS_URL` sul backend Replit:

```
THINKCENTRE_METRICS_URL=http://<ip-thinkcentre>:9101
```

Se la variabile non è impostata o il ThinkCentre non risponde, il pannello admin mostra **"Server di casa offline"**.

## Avvio automatico (opzionale)

```bash
# systemd — crea /etc/systemd/system/thinkcentre-agent.service
[Unit]
Description=ThinkCentre Metrics Agent
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/scripts/thinkcentre-agent/index.js
Restart=always
Environment=PORT=9101

[Install]
WantedBy=multi-user.target
```
