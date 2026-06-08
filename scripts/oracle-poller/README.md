# Oracle ARM Instance Poller — BikerLink

Script bash + servizio systemd che gira sul **ThinkCentre** (sempre acceso) e
tenta in loop di creare un'istanza Oracle Cloud Free Tier `VM.Standard.A1.Flex`
(4 OCPU / 24 GB RAM) finché non ci riesce.

Oracle Free Tier ARM è quasi sempre *Out of capacity*. Il poller ritenta ogni
60–300 secondi con jitter casuale, in modo da non fare rate-limit sull'API OCI.
Appena l'istanza viene creata, il servizio si auto-ferma e invia una notifica.

---

## File inclusi

| File | Scopo |
|------|-------|
| `oracle-poller.sh` | Script principale con retry loop |
| `install.sh` | Installa OCI CLI, copia script, registra systemd user unit |
| `oracle-poller.service` | Unit file systemd |
| `logrotate.conf` | Rotazione settimanale di `/var/log/oracle-poller.log` |
| `README.md` | Questo file |

La configurazione va in **`~/.oci/poller.conf`** (mai committata nel repo).

---

## Prerequisiti

- Ubuntu 22.04+ (o Debian 12+) — testato sul ThinkCentre
- `curl`, `python3` presenti (standard su Ubuntu)
- Accesso internet
- Account Oracle Cloud con Free Tier attivo
- SSH key pair (`~/.ssh/id_rsa.pub`)

---

## Installazione

```bash
# Sul ThinkCentre, come utente normale (NON root):
bash scripts/oracle-poller/install.sh
```

Lo script:
1. Controlla / installa l'OCI CLI ufficiale
2. Copia `oracle-poller.sh` in `/usr/local/bin/`
3. Crea `/var/log/oracle-poller.log` con i permessi corretti
4. Installa la configurazione logrotate in `/etc/logrotate.d/oracle-poller`
5. Registra il servizio systemd come **user unit** (`~/.config/systemd/user/`)
6. Crea il template `~/.oci/poller.conf` se non esiste già

---

## Configurazione OCI CLI

Se è la prima volta che usi OCI CLI sul ThinkCentre:

```bash
oci setup config
```

Avrai bisogno di:
- **User OCID** → Profilo utente → *User Information* → copia l'OCID
- **Tenancy OCID** → Administration → Tenancy Details → copia l'OCID
- **Region** → es. `eu-frankfurt-1`, `eu-milan-1`, `us-ashburn-1`
- **API Key** → il wizard la genera automaticamente in `~/.oci/`

Dopo il setup, carica la public key nel tuo profilo OCI:
*Profilo → API Keys → Add API Key → paste public key*

Verifica che funzioni:
```bash
oci iam region list
```

---

## Trovare i valori per poller.conf

### Compartment ID
```
OCI Console → Identity & Security → Compartments
→ copia l'OCID del compartimento root (o uno dedicato)
```

### Subnet ID
```
OCI Console → Networking → Virtual Cloud Networks
→ [la tua VCN] → Subnets
→ scegli una subnet PUBBLICA (con Internet Gateway)
→ copia l'OCID
```

> Se non hai ancora una VCN, crea una "Default VCN" con il wizard:
> Networking → Virtual Cloud Networks → *Start VCN Wizard*

### Image ID (Ubuntu 22.04 ARM)
```
OCI Console → Compute → Images → Platform images
→ filtra: Architecture = ARM64
→ cerca "Canonical-Ubuntu-22.04-aarch64-..." (prendi la più recente)
→ copia l'OCID
```

Oppure via CLI (sostituisci `<compartment-id>` e `<region>`):
```bash
oci compute image list \
  --compartment-id <compartment-id> \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "22.04" \
  --shape VM.Standard.A1.Flex \
  --all \
  --query 'data[0].id' \
  --raw-output
```

### Availability Domain
```
OCI Console → Compute → Instances → Create Instance
→ guarda il menu "Availability domain"
→ prova tutti gli AD disponibili nella tua region
```

Via CLI:
```bash
oci iam availability-domain list --compartment-id <tenancy-ocid>
```

---

## Configurazione poller.conf

```bash
nano ~/.oci/poller.conf
```

Valori minimi obbligatori:

```bash
OCI_COMPARTMENT_ID="ocid1.compartment.oc1..xxxxxxxxxx"
OCI_SUBNET_ID="ocid1.subnet.oc1.eu-frankfurt-1.xxxxxxxxxx"
OCI_IMAGE_ID="ocid1.image.oc1.eu-frankfurt-1.xxxxxxxxxx"
OCI_AVAILABILITY_DOMAIN="Uocm:EU-FRANKFURT-1-AD-1"
```

### Notifiche ntfy.sh (consigliato)

1. Installa l'app [ntfy](https://ntfy.sh) su iOS/Android
2. Scegli un topic univoco (es. `bikerlink-oracle-arm-tuoNome`)
3. Iscriviti al topic nell'app
4. In `poller.conf`:
   ```bash
   NTFY_TOPIC="bikerlink-oracle-arm-tuoNome"
   ```

### Notifiche Telegram

1. Crea un bot con [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copia il token (es. `123456:ABC-DEF...`)
3. Ottieni il tuo chat_id: apri [@userinfobot](https://t.me/userinfobot)
4. In `poller.conf`:
   ```bash
   TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   TELEGRAM_CHAT_ID="12345678"
   ```

---

## Avvio e monitoraggio

```bash
# Avvia
systemctl --user start oracle-poller

# Controlla lo stato
systemctl --user status oracle-poller

# Monitora i log in tempo reale
tail -f /var/log/oracle-poller.log

# Ferma manualmente
systemctl --user stop oracle-poller

# Disabilita (non si avvia più al boot)
systemctl --user disable oracle-poller
```

---

## Comportamento del servizio

| Situazione | Comportamento |
|-----------|---------------|
| "Out of capacity" | Riprova dopo backoff casuale (60–300s) |
| Altro errore OCI | Logga l'errore e riprova (non blocca) |
| Istanza creata (exit 0) | Log + notifica + **servizio si ferma** (non riavvia) |
| Crash dello script | Systemd lo riavvia dopo 10s (`Restart=on-failure`) |
| Riavvio del ThinkCentre | Il servizio si avvia automaticamente (`enable`) |

---

## Suggerimento: più Availability Domain

Se la tua region ha più AD, crea due file `poller.conf` separati e avvia il
poller manualmente con AD diversi per aumentare le chance:

```bash
OCI_AVAILABILITY_DOMAIN="Uocm:EU-FRANKFURT-1-AD-1" /usr/local/bin/oracle-poller.sh
OCI_AVAILABILITY_DOMAIN="Uocm:EU-FRANKFURT-1-AD-2" /usr/local/bin/oracle-poller.sh
```

(Fuori dallo scope attuale — multi-AD automatico non è implementato)

---

## Dopo la creazione dell'istanza

Una volta che l'istanza è RUNNING, passa allo step successivo:
configurazione di GraphHopper sull'istanza con `graphhopper/setup-oracle.sh`.

```bash
ssh ubuntu@<IP-ISTANZA>
# poi:
curl -fsSL https://raw.githubusercontent.com/your-org/bikerlink/main/graphhopper/setup-oracle.sh \
  | sudo DOMAIN=gh.bikerlink.app GH_TOKEN=<token> bash
```

---

## Sicurezza

- `~/.oci/poller.conf` ha permessi `600` (solo leggibile dall'utente)
- `~/.oci/poller.conf` è in `.gitignore` — non viene mai committato
- Il servizio gira come utente normale (non root)
- Nessun segreto viene loggato
