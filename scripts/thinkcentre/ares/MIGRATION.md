# Ares — Migrazione Windows → Linux (runbook, Task #5259)

Ares è il PC fisso che ospita l'istanza Ollama di diagnostica/studio (`DIAG_OLLAMA_*`).
Su Windows l'OS a riposo si mangia 12–20 GB di RAM: un modello 32B non entra in RAM →
swap-thrash. Su **Linux server headless** l'OS scende a ~1 GB, liberando i ~31 GB
(su 32 GB) per tenere un 32B Q4 interamente in RAM, senza swap.

Tutti gli script di questa cartella sono **idempotenti**: rilanciabili senza danni.
L'agente li esegue via `ares.py` (ProxyJump ThinkCentre→Ares). Ares resta **LAN-only**.

## Layout dischi (deciso con l'utente)
- **SSD 120 GB** → Linux + Ollama + modelli + swap.
- **NVMe 1 TB (NTFS, Windows)** → resta a Windows; montata r/w da Linux (ntfs3) come
  magazzino **output di Qwen** (solo file dati). Richiede Fast Startup/ibernazione OFF.
- **SSD 512 GB** → libero.

## Chi fa cosa
**Utente (passi fisici, l'agente lo guida a voce al momento):**
1. Montare l'SSD 120 GB nel PC.
2. Installare Linux server da chiavetta USB (boot USB, partizionamento, install).
3. BIOS: boot dal disco con GRUB.
4. Abilitare **una volta** OpenSSH Server su Windows (PowerShell admin):
   ```powershell
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd; Set-Service -Name sshd -StartupType Automatic
   ```
5. Lanciare il bootstrap (sotto) e incollare in chat le 3 righe IP/MAC/WoL.

**Agente (via SSH, tutto il resto):** Ollama, swap, mount NTFS, `powercfg /h off`,
GRUB, tunnel Cloudflare, Wake-on-LAN, verifiche, documentazione.

## Sequenza

### 1. Bootstrap connessione (utente, una volta, come root)
```bash
sudo bash ares-bootstrap.sh
```
Installa sshd+ethtool, crea l'utente `ares-agent` con la chiave pubblica dell'agente,
sudo NOPASSWD temporaneo, stampa IP/MAC/WoL. La chiave **privata** sta nel secret
Replit `ARES_SSH_KEY` (lato agente).

Verifica accesso (agente): `python3 scripts/thinkcentre/ares/ares.py status`

### 2. Prerequisiti (agente)
```bash
python3 scripts/thinkcentre/ares/ares.py exec "lsb_release -a; lspci | grep -i vga; ip -br link"
```

### 3. Ollama (agente)  → `ares-install-ollama.sh` (bind 127.0.0.1, KEEP_ALIVE=-1)
### 4. Swap 120 GB (agente)  → `ares-setup-swap.sh` (rete di sicurezza, mai su NTFS)
### 5. Windows: Fast Startup OFF (agente, via SSH a Windows)
```bash
ssh <utente>@<ip-windows> "powercfg /h off"   # poi un riavvio di Windows
```
### 6. Mount NTFS output (agente)  → `ares-mount-ntfs.sh` (ntfs3, fstab by UUID)
### 7. GRUB dual-boot (agente)  → `ares-grub.sh` (default Linux, timeout 8s)
### 8. Tunnel Cloudflare (agente)  → `ares-cloudflared.sh` (stesso hostname, httpHostHeader localhost)
### 9. Wake-on-LAN (agente)  → `ares-wol.sh` (persistente, MAC invariato)
### 10. Verifica end-to-end (agente)
```bash
python3 scripts/thinkcentre/ares/ares.py status
# + ${DIAG_OLLAMA_URL}/api/tags risponde coi modelli; monitor admin → Ares online;
#   wake-ares.sh dal TC sveglia Ares; reboot non presidiato atterra su Linux.
```
### 11. Hardening (agente, a fine migrazione)  → `ares-harden-sudo.sh`
Restringe il sudo NOPASSWD dell'agente ai soli comandi operativi.

## Done looks like
Vedi `task-5259.md`. In breve: Linux headless con Ollama (modello in RAM, no swap),
tunnel CF systemd, GRUB default Linux, NTFS montata r/w, swap attivo, WoL `g`
persistente, `wake-ares.sh` ancora funzionante (MAC invariato), monitor admin verde.
