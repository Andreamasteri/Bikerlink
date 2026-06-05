# Guida Installazione Ubuntu 22.04 LTS su SSD Dedicato

**Hardware target:** Intel i5-14400 · AMD RX 580 8 GB · SSD 120 GB dedicato

---

## Prima di iniziare

- L'SSD è **separato** dal disco Windows: nessun rischio di perdita dati
- Serve una chiavetta USB da ≥ 8 GB
- Tempo stimato: 30–45 minuti

---

## Passo 1 — Scaricare Ubuntu 22.04 LTS

1. Apri il browser su Windows e vai su:  
   **https://releases.ubuntu.com/22.04/**
2. Scarica `ubuntu-22.04.x-desktop-amd64.iso` (~4.7 GB)

---

## Passo 2 — Creare la USB bootable con Rufus

1. Scarica Rufus da **https://rufus.ie** (versione portable, nessuna installazione)
2. Inserisci la chiavetta USB
3. Apri Rufus:
   - **Dispositivo:** seleziona la tua chiavetta USB
   - **Tipo di avvio:** clicca "SELEZIONA" → scegli l'ISO Ubuntu scaricata
   - **Schema partizione:** GPT
   - **Sistema destinazione:** UEFI (non CSM)
   - Tutti gli altri parametri restano di default
4. Clicca **AVVIA** → conferma la sovrascrittura della chiavetta
5. Attendi il completamento (5–10 minuti)

---

## Passo 3 — Configurare il BIOS/UEFI

1. **Spegni il PC** e collega il **SSD dedicato da 120 GB** (se non già collegato)
2. Accendi e premi ripetutamente **F2** o **Del** (tasto BIOS — varia per scheda madre)
   - Per Asus: **Del** o **F2**
   - Per MSI: **Del**
   - Per Gigabyte: **Del** o **F2**
3. Nel BIOS:
   - Vai in **Boot** → **Boot Priority** (o Secure Boot)
   - **Disabilita Secure Boot** (necessario per ROCm/AMDGPU DKMS)
   - Imposta come **primo dispositivo di boot** la chiavetta USB
4. Salva e riavvia (**F10** → Save & Exit)

---

## Passo 4 — Installare Ubuntu sull'SSD

1. Seleziona **"Try or Install Ubuntu"** dal menu GRUB
2. Nella schermata di benvenuto seleziona **"Installa Ubuntu"**
3. Lingua: **Italiano** (o quella che preferisci)
4. Layout tastiera: **Italiano**
5. Tipo di installazione: **"Cancella disco e installa Ubuntu"**
   - **⚠ ATTENZIONE:** assicurati che il disco selezionato sia l'SSD da 120 GB,  
     **NON** il disco Windows. Verifica la dimensione nel menu a tendina.
6. Clicca **"Cambia…"** per il partizionamento manuale (consigliato):

### Partizionamento manuale consigliato (SSD 120 GB)

| Partizione    | Dimensione | Tipo       | Mount point |
|---------------|------------|------------|-------------|
| /boot/efi     | 512 MB     | FAT32      | /boot/efi   |
| swap          | 8 GB       | swap       | —           |
| / (root)      | ~111 GB    | ext4       | /           |

   - Seleziona il disco SSD → **Nuova tabella partizioni** → GPT
   - Crea le 3 partizioni nell'ordine sopra
   - Seleziona il device bootloader: **l'SSD da 120 GB** (es. `/dev/sdb`)

7. Inserisci nome utente e password (segnali — serviranno dopo)
8. Clicca **Installa** e attendi (~10–15 minuti)
9. A fine installazione: **rimuovi la chiavetta USB** quando richiesto, poi riavvia

---

## Passo 5 — Selezionare l'SSD al boot

Dopo la prima installazione, per avviare Linux:

1. Accendi il PC e premi **F8** o **F11** (Boot Menu — varia per scheda madre)
   - Per Asus: **F8**
   - Per MSI: **F11**
   - Per Gigabyte: **F12**
2. Seleziona l'SSD con Ubuntu dall'elenco
3. Ubuntu si avvia

> **Tip:** Per rendere permanente il boot da Linux senza premere ogni volta il tasto,
> vai nel BIOS → Boot Priority e metti l'SSD Ubuntu al primo posto.
> Windows sarà comunque avviabile selezionando il suo disco dal Boot Menu.

---

## Passo 6 — Primo avvio e preparazione

1. Accedi con le credenziali impostate durante l'installazione
2. Apri il **Terminale** (tasto destro sul desktop → "Apri nel terminale")
3. Aggiorna il sistema:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
4. Trasferisci `setup.sh` sull'SSD (via chiavetta USB o GitHub) ed eseguilo:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

---

## Risoluzione problemi comuni

| Problema | Soluzione |
|----------|-----------|
| Il PC non vede la USB al boot | Verifica che Secure Boot sia disabilitato nel BIOS |
| Il boot menu non appare | Prova F8, F11, F12, Esc (dipende dalla scheda madre) |
| GRUB avvia Windows invece di Ubuntu | Entra nel BIOS e cambia la priorità di boot |
| Schermo nero dopo il boot | Aggiungi `nomodeset` nei parametri GRUB (temporaneo, poi setup.sh installa i driver corretti) |
