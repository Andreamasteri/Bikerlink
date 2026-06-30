---
name: Ares Windows→Linux migration
description: How the agent reaches/operates Ares after the move to Linux headless, and where the idempotent migration scripts live.
---

# Ares migrazione Windows → Linux headless

Ares = PC fisso (Ollama diagnostica/studio `DIAG_OLLAMA_*`), SEPARATO dal ThinkCentre,
stessa LAN. Spostato su Linux server headless per liberare RAM (OS ~1 GB invece di
12–20 GB su Windows) e tenere un 32B Q4 interamente in RAM senza swap.

**Accesso (LAN-only, ProxyJump):** dalla sandbox Replit Ares si raggiunge SOLO
saltando dal ThinkCentre. Helper: `scripts/thinkcentre/ares/ares.py` (status|exec|ip).
- Chiave privata agente = secret `ARES_SSH_KEY` (ed25519); pubblica incorporata in
  `ares-bootstrap.sh`. Utente SSH su Ares: `ares-agent`.
- IP di Ares è **dinamico** (niente DHCP reservation per scelta): `ares.py` lo risolve
  dalla neighbor table del TC via MAC `A8:E2:91:2C:90:6A`, oppure `ARES_LAN_IP=<ip>`.

**MAC invariato** dopo la migrazione → `scripts/thinkcentre/wake-ares.sh` (WoL via TC)
funziona identico. WoL persistente su Linux via `ares-wol.sh`.

**Runbook + script idempotenti:** `scripts/thinkcentre/ares/MIGRATION.md` +
`ares-bootstrap.sh` (utente, una volta), `ares-install-ollama.sh` (bind 127.0.0.1,
KEEP_ALIVE=-1), `ares-setup-swap.sh` (rete di sicurezza, mai su NTFS),
`ares-mount-ntfs.sh` (ntfs3, richiede `powercfg /h off` su Windows),
`ares-grub.sh` (default Linux), `ares-cloudflared.sh` (stesso hostname,
`httpHostHeader: localhost`), `ares-wol.sh`, `ares-harden-sudo.sh` (a fine setup).

**Why:** i passi fisici (disco, install Linux, BIOS, abilitare OpenSSH su Windows una
volta) sono dell'utente; tutto il resto è scriptato così niente dipende dalla memoria.

**How to apply:** quando si lavora su Ares-Linux, usa `ares.py` (non `tc.py`, che va
solo sul TC) e gli script in `scripts/thinkcentre/ares/`. I live-step (Ollama/swap/
mount/grub/cloudflared/wol) richiedono che l'utente abbia già installato Linux e
lanciato il bootstrap.
