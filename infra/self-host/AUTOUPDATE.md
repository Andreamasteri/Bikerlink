# Auto-aggiornamento repo BikerLink sul ThinkCentre

Il timer systemd aggiorna automaticamente `~/bikerlink` ogni 5 minuti con `git pull --ff-only`. Se il pull fallisce (rete assente, conflitti), logga l'errore in `~/bikerlink-update.log` senza rompere nulla.

---

## Installazione (3 comandi)

Apri un terminale sul ThinkCentre ed esegui:

```bash
# 1. Copia i file systemd nella cartella di sistema
sudo cp ~/bikerlink/infra/self-host/bikerlink-update.service /etc/systemd/system/
sudo cp ~/bikerlink/infra/self-host/bikerlink-update.timer  /etc/systemd/system/

# 2. Ricarica la configurazione di systemd
sudo systemctl daemon-reload

# 3. Abilita e avvia il timer
sudo systemctl enable --now bikerlink-update.timer
```

---

## Verifica che funzioni

```bash
# Controlla lo stato del timer
systemctl status bikerlink-update.timer

# Guarda quando scatta la prossima esecuzione
systemctl list-timers bikerlink-update.timer

# Leggi i log in tempo reale
tail -f ~/bikerlink-update.log

# Oppure i log di sistema
journalctl -u bikerlink-update.service -f
```

---

## Come funziona

| File | Ruolo |
|------|-------|
| `bikerlink-update.sh` | Script bash: entra in `~/bikerlink`, fa `git pull --ff-only`, logga esito + timestamp |
| `bikerlink-update.service` | Unit systemd oneshot: esegue lo script come utente `andrea` |
| `bikerlink-update.timer` | Timer systemd: triggera il service 2 min dopo il boot, poi ogni 5 minuti |
| `~/bikerlink-update.log` | Log rotante (max 500 righe) con esito di ogni pull |

---

## Disabilitare il timer

```bash
sudo systemctl disable --now bikerlink-update.timer
```

---

## Note

- Il pull usa `--ff-only`: se ci sono commit locali divergenti il pull **non** viene forzato e l'errore è loggato. In quel caso fai `git fetch && git reset --hard origin/main` manualmente.
- Lo script **non** riavvia GraphHopper, Ollama o altri servizi — solo aggiorna i file.
