---
name: ThinkCentre SSH access
description: Come accedere via SSH al ThinkCentre per gestire servizi — accesso via Cloudflare Access SSH tunnel, credenziali in env.
---

Le credenziali SSH sono già presenti nell'environment Replit come variabili d'ambiente:
- `TC_SSH_HOST` = `ssh.biker-link.net` (hostname Cloudflare Access SSH — NON ip diretto né tc.biker-link.net)
- `TC_SSH_USER` — utente linux (andrea)
- `TC_SSH_KEY` — chiave privata OpenSSH (tc.py la ricostruisce dai newline collassati)
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` — service token Cloudflare Access

⚠️ `TC_SSH_PASSWORD` NON è più usato — accesso solo via chiave SSH + Cloudflare Access.

**Pattern preferito:** usare `tc.py` in `.agents/skills/thinkcentre-access/tc.py`:
```bash
python3 .agents/skills/thinkcentre-access/tc.py status
python3 .agents/skills/thinkcentre-access/tc.py exec "<comando>"
python3 .agents/skills/thinkcentre-access/tc.py exec "<cmd sudo>" --sudo
```

`tc.py` usa `cloudflared access ssh --hostname %h` come ProxyCommand. NON usare IP LAN diretto dalla sandbox Replit.

**Porta SSH:** 2222 (hardening applicato — PasswordAuthentication no, PermitRootLogin no, MaxAuthTries 3, Port 2222)

**Cloudflare tunnel ingress SSH:**
- hostname: `ssh.biker-link.net` → service: `ssh://localhost:2222`
- Aggiornato via CF API (account `d116d3d97b133c543d02934be4bc98d2`, tunnel `86122511-2752-4002-aec9-1fdd7c25b9f5`)
- Se il tunnel viene riconfigurato, il CF API endpoint da usare è `cfd_tunnel/{id}/configurations` (PUT)

**Sudo:** `tc.py exec "<cmd>" --sudo` usa `sudo -n` (passwordless sudo per andrea).

**Why:** L'utente ha confermato accesso via env e vuole uso diretto senza chiedere credenziali (22 giu 2026). SSH hardening applicato il 15 lug 2026: porta spostata 22→2222 + CF tunnel config aggiornata contestualmente.

**How to apply:** Ogni volta che devo eseguire comandi sul ThinkCentre, usare `tc.py`. Porta SSH = 2222 in ogni script/runbook.

**Servizi e come girano:**
- Ollama: systemd (`sudo systemctl stop/start/status ollama`) — NON Docker
- Nominatim, Whisper, GraphHopper (×7 aree), Postgres, Redis, Valhalla: Docker (`docker stop/start bikerlink-<nome>`)
- Script `thinkcentre-scripts/services.sh stop/start/status` per gestione bulk
