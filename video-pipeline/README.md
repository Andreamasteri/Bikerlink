# BikerLink — Pipeline Video Promozionali

Ambiente Linux nativo su SSD dedicato per generare video promozionali BikerLink con GPU AMD RX 580 tramite ROCm + ComfyUI.

**Hardware target:** Intel i5-14400 · AMD RX 580 8 GB VRAM · SSD 120 GB · Ubuntu 22.04 LTS

---

## Struttura directory

```
video-pipeline/
├── UBUNTU-INSTALL.md          # Guida installazione Ubuntu sull'SSD
├── setup.sh                   # Installa tutto l'ambiente (una volta sola)
├── generate.sh                # Genera video da uno script testuale
├── README.md                  # Questo file
└── scripts/
    ├── navigazione-curvy.txt  # Script video "Navigazione Curvy"
    └── community-motoclub.txt # Script video "Community MotoClub"
```

---

## Primo avvio — Guida rapida

### Passo 1: Installa Ubuntu sull'SSD

Segui la guida completa in [`UBUNTU-INSTALL.md`](UBUNTU-INSTALL.md).  
In sintesi:
1. Crea USB bootable con Rufus + ISO Ubuntu 22.04
2. Disabilita Secure Boot nel BIOS
3. Installa Ubuntu sull'SSD da 120 GB (non toccare il disco Windows)
4. Riavvia e seleziona l'SSD dal Boot Menu (F8/F11)

### Passo 2: Copia i file sul nuovo Ubuntu

Dopo il primo avvio su Ubuntu, copia questa cartella sull'SSD tramite chiavetta USB o `git clone`.

### Passo 3: Esegui setup.sh

```bash
cd video-pipeline
chmod +x setup.sh generate.sh
./setup.sh
```

Il setup installa automaticamente:
- Driver AMDGPU + ROCm 5.7 (con workaround per RX 580/GFX803)
- PyTorch con backend ROCm
- ComfyUI + ComfyUI Manager
- Modello Wan2.1-T2V-1.3B (~2.5 GB)
- Piper TTS con voce italiana (paola-medium)
- ffmpeg

⚠️ **Riavvia il sistema dopo setup.sh** per caricare i moduli kernel AMDGPU:
```bash
sudo reboot
```

### Passo 4: Avvia ComfyUI

```bash
~/start-comfyui.sh
```

Apri il browser: **http://localhost:8188**

ComfyUI deve essere in esecuzione prima di lanciare `generate.sh`.

---

## Generare i video BikerLink

### Video 1 — Navigazione Curvy

```bash
./generate.sh scripts/navigazione-curvy.txt
```

Produce 3 file pronti per la pubblicazione:
- `curvy-video_TIMESTAMP_appstore_1080p.mp4` → App Store Preview (1920×1080 H.264)
- `curvy-video_TIMESTAMP_playstore_1080p.mp4` → Play Store (1920×1080 MP4)
- `curvy-video_TIMESTAMP_reels_9x16.mp4` → Instagram Reels / TikTok (1080×1920)

### Video 2 — Community MotoClub

```bash
./generate.sh scripts/community-motoclub.txt
```

### Output personalizzato

```bash
./generate.sh scripts/navigazione-curvy.txt nome-custom
```

Tutti i file finali vengono salvati in:
```
~/bikerlink-videos/final/
```

---

## Creare nuovi video

Per creare un nuovo script video, crea un file `.txt` con questo formato:

```
SCENA: Nome della scena
PROMPT: Descrizione visiva dettagliata per ComfyUI (in inglese, più dettagli = meglio)
NARRAZIONE: Testo della narrazione in italiano (Piper TTS lo sintetizza)
DURATA: 6
---
SCENA: Seconda scena
PROMPT: ...
NARRAZIONE: ...
DURATA: 5
---
```

**Consigli per i prompt ComfyUI:**
- Scrivi in inglese
- Aggiungi stile: `cinematic`, `photorealistic`, `4K`, `dramatic lighting`
- Specifica la prospettiva: `aerial drone shot`, `first-person POV`, `close-up`
- Descrivi l'ambientazione: `Italian Alps`, `Tuscan road`, `mountain viewpoint`
- Evita soggetti generici: più specifico = risultato migliore

**Durata consigliata per scena:** 5–8 secondi (Wan2.1 genera max 81 frame).

---

## Specifiche tecniche export

| Formato | Risoluzione | Codec | Uso |
|---------|-------------|-------|-----|
| App Store | 1920×1080 | H.264 High Profile | App Store Preview Video |
| Play Store | 1920×1080 | H.264 MP4 | Google Play Store |
| Reels 9:16 | 1080×1920 | H.264 MP4 | Instagram Reels, TikTok, YouTube Shorts |

---

## Selezionare l'SSD Ubuntu dal BIOS

Ad ogni accensione, per avviare Linux invece di Windows:

| Scheda madre | Tasto Boot Menu |
|--------------|-----------------|
| Asus         | F8              |
| MSI          | F11             |
| Gigabyte     | F12             |

Seleziona l'SSD da 120 GB con Ubuntu. Windows rimane intoccato sul suo disco.

> **Per rendere Linux il boot predefinito:** entra nel BIOS (Del/F2 all'avvio) → Boot Priority → metti l'SSD Ubuntu al primo posto. Windows è sempre selezionabile dal Boot Menu.

---

## Risoluzione problemi

### ComfyUI non si avvia

```bash
# Verifica che la GPU sia riconosciuta
HSA_OVERRIDE_GFX_VERSION=8.0.3 rocminfo | grep -i "gfx\|Name"

# Riavvia ComfyUI con log verbosi
source ~/comfyui-venv/bin/activate
cd ~/ComfyUI
python main.py --listen --port 8188 --use-pytorch-cross-attention --lowvram
```

### GPU non riconosciuta da ROCm

```bash
# Verifica variabile ambiente
echo $HSA_OVERRIDE_GFX_VERSION   # deve stampare: 8.0.3

# Verifica appartenenza ai gruppi
groups | grep -E "render|video"

# Se manca, aggiungiti e riavvia
sudo usermod -aG render,video $USER && sudo reboot
```

### Piper TTS non genera audio

```bash
# Test diretto
echo "Test voce italiana BikerLink" | \
    ~/piper/piper --model ~/piper/voices/it_IT-paola-medium.onnx \
    --output_file /tmp/test.wav
aplay /tmp/test.wav
```

### Video generato è nero / di bassa qualità

- Aumenta `DURATA` delle scene a 7–8 secondi
- Migliora i `PROMPT` con più dettagli visivi in inglese
- Verifica che ComfyUI stia usando la GPU: nella UI web → icona settings → controlla "cuda" o "rocm"

---

## Aggiornare gli script per futuri video

1. Duplica un file in `scripts/` e personalizzalo
2. Lancia `./generate.sh scripts/nuovo-video.txt`
3. I file finali sono in `~/bikerlink-videos/final/`

Per aggiornare ComfyUI o il modello:
```bash
cd ~/ComfyUI && git pull
source ~/comfyui-venv/bin/activate
pip install -r requirements.txt
```
