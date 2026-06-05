#!/usr/bin/env bash
# =============================================================================
# BikerLink Video Pipeline — setup.sh
# Target: Ubuntu 22.04 LTS · AMD RX 580 8 GB · i5-14400 · SSD 120 GB
# Eseguire al primo boot come utente normale (non root)
# Uso: chmod +x setup.sh && ./setup.sh
# =============================================================================
set -euo pipefail

BIKERLINK_DIR="$HOME/bikerlink-videos"
COMFYUI_DIR="$HOME/ComfyUI"
VENV_DIR="$HOME/comfyui-venv"
PIPER_DIR="$HOME/piper"
LOG_FILE="$HOME/setup-bikerlink.log"

# Colori output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[OK]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }
err() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

echo "============================================="
echo " BikerLink Video Pipeline — Setup"
echo " $(date)"
echo "=============================================" | tee "$LOG_FILE"

# Verifica utente non-root
if [ "$EUID" -eq 0 ]; then
    err "Esegui come utente normale, non root. Lo script usa sudo dove necessario."
fi

# =============================================================================
# SEZIONE 1 — Aggiornamenti e pacchetti base
# =============================================================================
info "=== SEZIONE 1: Aggiornamenti sistema ==="

sudo apt update -y 2>&1 | tee -a "$LOG_FILE"
sudo apt upgrade -y 2>&1 | tee -a "$LOG_FILE"
sudo apt install -y \
    curl wget git build-essential \
    python3.10 python3.10-venv python3.10-dev python3-pip \
    ffmpeg \
    cmake ninja-build pkg-config \
    libssl-dev libffi-dev \
    dkms linux-headers-$(uname -r) \
    software-properties-common apt-transport-https \
    espeak-ng libsndfile1 \
    htop nvtop unzip \
    2>&1 | tee -a "$LOG_FILE"

log "Pacchetti base installati"

# =============================================================================
# SEZIONE 2 — Driver AMDGPU + ROCm 5.7 (RX 580 / GFX803)
# =============================================================================
info "=== SEZIONE 2: Driver AMDGPU e ROCm 5.7 ==="

# Aggiunta utente al gruppo render e video (permessi GPU senza sudo)
sudo usermod -aG render,video "$USER"
log "Utente aggiunto ai gruppi render e video"

# Rimozione eventuali installazioni ROCm precedenti
sudo apt remove -y rocm-libs rocm-dev rocm-utils 2>/dev/null || true

# Aggiunta repository ROCm 5.7
ROCM_VERSION="5.7"
ROCM_REPO_URL="https://repo.radeon.com/rocm/apt/${ROCM_VERSION}"

wget -qO - https://repo.radeon.com/rocm/rocm.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/rocm.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/rocm.gpg] ${ROCM_REPO_URL} jammy main" \
    | sudo tee /etc/apt/sources.list.d/rocm.list

# Aggiunta repository amdgpu DKMS
wget -qO - https://repo.radeon.com/amdgpu/latest/ubuntu/pool/main/a/amdgpu-install/amdgpu-install_*.deb 2>/dev/null || \
    wget -qO /tmp/amdgpu-install.deb \
        "https://repo.radeon.com/amdgpu-install/22.40.3/ubuntu/jammy/amdgpu-install_22.40.3.50403-1_all.deb"
sudo apt install -y /tmp/amdgpu-install.deb 2>&1 | tee -a "$LOG_FILE" || true
sudo amdgpu-install --usecase=rocm --no-32 -y 2>&1 | tee -a "$LOG_FILE" || {
    warn "amdgpu-install fallito, installo ROCm manualmente via apt"
    sudo apt update -y
    sudo apt install -y rocm-hip-sdk rocm-opencl-sdk 2>&1 | tee -a "$LOG_FILE"
}

# =============================================================================
# WORKAROUND OBBLIGATORIO — RX 580 / GFX803 / Polaris
# ROCm non riconosce nativamente GFX803 su versioni recenti.
# HSA_OVERRIDE_GFX_VERSION=8.0.3 forza il runtime a trattare la GPU
# come GFX803 abilitando tutte le operazioni HIP/ROCm.
# =============================================================================
BASHRC="$HOME/.bashrc"
if ! grep -q "HSA_OVERRIDE_GFX_VERSION" "$BASHRC"; then
    cat >> "$BASHRC" << 'EOF'

# BikerLink GPU — Workaround RX 580 (GFX803/Polaris)
export HSA_OVERRIDE_GFX_VERSION=8.0.3
export ROCM_PATH=/opt/rocm
export PATH="$ROCM_PATH/bin:$ROCM_PATH/hip/bin:$PATH"
export LD_LIBRARY_PATH="$ROCM_PATH/lib:$ROCM_PATH/hip/lib:$LD_LIBRARY_PATH"

# ComfyUI output
export BIKERLINK_VIDEOS="$HOME/bikerlink-videos"
EOF
    log "Variabili ambiente ROCm aggiunte a ~/.bashrc"
fi

# Applica nell'attuale sessione
export HSA_OVERRIDE_GFX_VERSION=8.0.3
export ROCM_PATH=/opt/rocm
export PATH="$ROCM_PATH/bin:$ROCM_PATH/hip/bin:$PATH"
export LD_LIBRARY_PATH="$ROCM_PATH/lib:$ROCM_PATH/hip/lib:${LD_LIBRARY_PATH:-}"

# Verifica ROCm
info "Verifica ROCm (potrebbe richiedere il riavvio per i moduli kernel)..."
if command -v rocminfo &>/dev/null; then
    rocminfo 2>&1 | grep -E "Name|gfx|HSA Agent" | head -20 | tee -a "$LOG_FILE" || true
    log "rocminfo eseguito con successo"
else
    warn "rocminfo non trovato — potrebbe essere necessario riavviare il sistema e rieseguire lo script"
fi

# Regola udev per accesso GPU senza sudo
if [ ! -f /etc/udev/rules.d/70-amdgpu.rules ]; then
    sudo tee /etc/udev/rules.d/70-amdgpu.rules << 'EOF'
SUBSYSTEM=="kfd", KERNEL=="kfd", TAG+="uaccess", GROUP="render", MODE="0660"
SUBSYSTEM=="drm", KERNEL=="card*", TAG+="uaccess", GROUP="video", MODE="0660"
SUBSYSTEM=="drm", KERNEL=="renderD*", TAG+="uaccess", GROUP="render", MODE="0660"
EOF
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    log "Regole udev GPU configurate"
fi

# =============================================================================
# SEZIONE 3 — Ottimizzazioni OS
# =============================================================================
info "=== SEZIONE 3: Ottimizzazioni OS ==="

# CPU governor: performance (massima frequenza, nessun throttling)
if command -v cpufreq-set &>/dev/null 2>&1; then
    sudo cpufreq-set -r -g performance 2>/dev/null || true
else
    sudo apt install -y cpufrequtils 2>&1 | tee -a "$LOG_FILE"
    for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
        echo "performance" | sudo tee "$cpu" > /dev/null 2>&1 || true
    done
fi

# Rendi permanente il governor al boot
if [ ! -f /etc/systemd/system/cpu-performance.service ]; then
    sudo tee /etc/systemd/system/cpu-performance.service << 'EOF'
[Unit]
Description=CPU Performance Governor
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo performance > $f; done'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl enable cpu-performance.service
    log "CPU governor performance abilitato al boot"
fi

# Disabilita servizi non necessari per la pipeline video
for svc in bluetooth cups avahi-daemon; do
    if systemctl is-enabled "$svc" &>/dev/null; then
        sudo systemctl disable --now "$svc" 2>/dev/null || true
        log "Servizio $svc disabilitato"
    fi
done

# Parametri kernel per performance I/O su SSD
if ! grep -q "vm.swappiness=10" /etc/sysctl.conf 2>/dev/null; then
    sudo tee -a /etc/sysctl.conf << 'EOF'

# BikerLink SSD optimizations
vm.swappiness=10
vm.dirty_ratio=15
vm.dirty_background_ratio=5
EOF
    sudo sysctl -p 2>&1 | tee -a "$LOG_FILE"
    log "Parametri kernel ottimizzati per SSD"
fi

# I/O scheduler: none (ottimale per NVMe/SSD)
for disk in $(lsblk -d -o NAME,ROTA | awk '$2==0{print $1}'); do
    echo "none" | sudo tee "/sys/block/$disk/queue/scheduler" > /dev/null 2>&1 || true
done
log "I/O scheduler ottimizzato per SSD"

# =============================================================================
# SEZIONE 4 — Python venv + PyTorch ROCm + ComfyUI + Wan2.1 + Piper + ffmpeg
# =============================================================================
info "=== SEZIONE 4: ComfyUI + Modello + TTS ==="

# Crea directory output
mkdir -p "$BIKERLINK_DIR"/{clips,voiceover,music,final}
log "Directory output creata: $BIKERLINK_DIR"

# Virtual environment Python 3.10
if [ ! -d "$VENV_DIR" ]; then
    python3.10 -m venv "$VENV_DIR"
    log "Virtualenv Python 3.10 creato in $VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Aggiorna pip
pip install --upgrade pip wheel setuptools 2>&1 | tee -a "$LOG_FILE"

# PyTorch con backend ROCm 5.7
info "Installazione PyTorch ROCm (potrebbe richiedere 10-15 minuti)..."
pip install torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/rocm5.7 \
    2>&1 | tee -a "$LOG_FILE"
log "PyTorch ROCm installato"

# Verifica PyTorch + GPU
python3 -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'ROCm disponibile: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
" 2>&1 | tee -a "$LOG_FILE" || warn "Verifica GPU fallita — potrebbe essere necessario un riavvio"

# ComfyUI
if [ ! -d "$COMFYUI_DIR" ]; then
    git clone https://github.com/comfyanonymous/ComfyUI.git "$COMFYUI_DIR" 2>&1 | tee -a "$LOG_FILE"
    log "ComfyUI clonato in $COMFYUI_DIR"
fi

pip install -r "$COMFYUI_DIR/requirements.txt" 2>&1 | tee -a "$LOG_FILE"

# ComfyUI Manager
COMFY_MANAGER_DIR="$COMFYUI_DIR/custom_nodes/ComfyUI-Manager"
if [ ! -d "$COMFY_MANAGER_DIR" ]; then
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git "$COMFY_MANAGER_DIR" \
        2>&1 | tee -a "$LOG_FILE"
    log "ComfyUI Manager installato"
fi

# Download modello Wan2.1-T2V-1.3B (testo → video, 8 GB VRAM)
WAN_MODEL_DIR="$COMFYUI_DIR/models/diffusion_models"
WAN_VAE_DIR="$COMFYUI_DIR/models/vae"
WAN_CLIP_DIR="$COMFYUI_DIR/models/text_encoders"
mkdir -p "$WAN_MODEL_DIR" "$WAN_VAE_DIR" "$WAN_CLIP_DIR"

info "Download modello Wan2.1-T2V-1.3B da Hugging Face (~2.5 GB)..."
WAN_MODEL_FILE="$WAN_MODEL_DIR/diffusion_pytorch_model.safetensors"
if [ ! -f "$WAN_MODEL_FILE" ]; then
    pip install huggingface_hub 2>&1 | tee -a "$LOG_FILE"
    python3 - << 'PYEOF'
from huggingface_hub import hf_hub_download
import os

model_dir = os.path.expanduser("~/ComfyUI/models/diffusion_models")
vae_dir = os.path.expanduser("~/ComfyUI/models/vae")
clip_dir = os.path.expanduser("~/ComfyUI/models/text_encoders")

print("Download wan2.1_t2v_1.3B...")
hf_hub_download(
    repo_id="Wan-AI/Wan2.1-T2V-1.3B",
    filename="diffusion_pytorch_model.safetensors",
    local_dir=model_dir,
    local_dir_use_symlinks=False
)

print("Download VAE...")
hf_hub_download(
    repo_id="Wan-AI/Wan2.1-T2V-1.3B",
    filename="Wan2.1_VAE.pth",
    local_dir=vae_dir,
    local_dir_use_symlinks=False
)

print("Download text encoder (UMT5)...")
hf_hub_download(
    repo_id="Wan-AI/Wan2.1-T2V-1.3B",
    filename="umt5-xxl-enc-bf16.pth",
    local_dir=clip_dir,
    local_dir_use_symlinks=False
)
print("Download completato.")
PYEOF
    log "Modello Wan2.1-T2V-1.3B scaricato"
else
    log "Modello Wan2.1-T2V-1.3B già presente"
fi

# Crea script di avvio ComfyUI
cat > "$HOME/start-comfyui.sh" << 'EOF'
#!/usr/bin/env bash
# Avvia ComfyUI con backend ROCm per RX 580
export HSA_OVERRIDE_GFX_VERSION=8.0.3
export ROCM_PATH=/opt/rocm
export PATH="$ROCM_PATH/bin:$PATH"
source "$HOME/comfyui-venv/bin/activate"
cd "$HOME/ComfyUI"
python main.py \
    --listen 0.0.0.0 \
    --port 8188 \
    --use-pytorch-cross-attention \
    --lowvram \
    2>&1 | tee -a "$HOME/comfyui.log"
EOF
chmod +x "$HOME/start-comfyui.sh"
log "Script avvio ComfyUI creato: ~/start-comfyui.sh"

# Piper TTS con voce italiana
info "Installazione Piper TTS..."
if [ ! -d "$PIPER_DIR" ]; then
    mkdir -p "$PIPER_DIR"
    PIPER_RELEASE="https://github.com/rhasspy/piper/releases/download/2023.11.14-2"
    wget -qO /tmp/piper.tar.gz "${PIPER_RELEASE}/piper_linux_x86_64.tar.gz" \
        2>&1 | tee -a "$LOG_FILE"
    tar -xf /tmp/piper.tar.gz -C "$PIPER_DIR" --strip-components=1
    rm /tmp/piper.tar.gz
    log "Piper TTS estratto in $PIPER_DIR"
fi

# Voce italiana paola-medium
PIPER_VOICE_DIR="$PIPER_DIR/voices"
mkdir -p "$PIPER_VOICE_DIR"
PAOLA_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium"
for ext in onnx onnx.json; do
    VOICE_FILE="$PIPER_VOICE_DIR/it_IT-paola-medium.$ext"
    if [ ! -f "$VOICE_FILE" ]; then
        wget -qO "$VOICE_FILE" "${PAOLA_BASE}/it_IT-paola-medium.${ext}" \
            2>&1 | tee -a "$LOG_FILE"
    fi
done
log "Voce italiana Piper (paola-medium) scaricata"

# Link simbolico piper nel PATH
if [ ! -L /usr/local/bin/piper ]; then
    sudo ln -sf "$PIPER_DIR/piper" /usr/local/bin/piper
fi

# Verifica ffmpeg
FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1)
log "ffmpeg: $FFMPEG_VER"

deactivate

# =============================================================================
# SEZIONE 5 — Workflow ComfyUI per Wan2.1 (JSON salvato su disco)
# =============================================================================
info "=== SEZIONE 5: Workflow ComfyUI Wan2.1 ==="

WORKFLOW_DIR="$COMFYUI_DIR/user/default/workflows"
mkdir -p "$WORKFLOW_DIR"

cat > "$WORKFLOW_DIR/bikerlink-wan21-t2v.json" << 'WFEOF'
{
  "last_node_id": 10,
  "last_link_id": 12,
  "nodes": [
    {
      "id": 1,
      "type": "WanVideoModelLoader",
      "pos": [50, 100],
      "outputs": [{"name": "model", "type": "WANVIDEOMODEL", "links": [3]}],
      "widgets_values": ["diffusion_pytorch_model.safetensors", "bf16"]
    },
    {
      "id": 2,
      "type": "CLIPLoader",
      "pos": [50, 250],
      "outputs": [{"name": "CLIP", "type": "CLIP", "links": [4]}],
      "widgets_values": ["umt5-xxl-enc-bf16.pth", "wan"]
    },
    {
      "id": 3,
      "type": "WanVideoVAELoader",
      "pos": [50, 400],
      "outputs": [{"name": "vae", "type": "VAE", "links": [5]}],
      "widgets_values": ["Wan2.1_VAE.pth"]
    },
    {
      "id": 4,
      "type": "CLIPTextEncode",
      "pos": [350, 100],
      "inputs": [{"name": "clip", "type": "CLIP", "link": 4}],
      "outputs": [{"name": "CONDITIONING", "type": "CONDITIONING", "links": [6]}],
      "widgets_values": ["PROMPT_PLACEHOLDER"]
    },
    {
      "id": 5,
      "type": "CLIPTextEncode",
      "pos": [350, 280],
      "inputs": [{"name": "clip", "type": "CLIP", "link": 4}],
      "outputs": [{"name": "CONDITIONING", "type": "CONDITIONING", "links": [7]}],
      "widgets_values": ["blurry, low quality, distorted, watermark, text"]
    },
    {
      "id": 6,
      "type": "WanVideoSampler",
      "pos": [650, 200],
      "inputs": [
        {"name": "model", "type": "WANVIDEOMODEL", "link": 3},
        {"name": "positive", "type": "CONDITIONING", "link": 6},
        {"name": "negative", "type": "CONDITIONING", "link": 7},
        {"name": "vae", "type": "VAE", "link": 5}
      ],
      "outputs": [{"name": "samples", "type": "LATENT", "links": [8]}],
      "widgets_values": [42, "euler", "linear", 20, 7.0, 81, 480, 832, 16]
    },
    {
      "id": 7,
      "type": "WanVideoDecode",
      "pos": [950, 200],
      "inputs": [
        {"name": "samples", "type": "LATENT", "link": 8},
        {"name": "vae", "type": "VAE", "link": 5}
      ],
      "outputs": [{"name": "images", "type": "IMAGE", "links": [9]}],
      "widgets_values": [true]
    },
    {
      "id": 8,
      "type": "SaveAnimatedWEBP",
      "pos": [1200, 200],
      "inputs": [{"name": "images", "type": "IMAGE", "link": 9}],
      "widgets_values": ["bikerlink_clip", 30, true, 80, "default"]
    }
  ],
  "links": [
    [3, 1, 0, 6, 0, "WANVIDEOMODEL"],
    [4, 2, 0, 4, 0, "CLIP"],
    [4, 2, 0, 5, 0, "CLIP"],
    [5, 3, 0, 6, 3, "VAE"],
    [5, 3, 0, 7, 1, "VAE"],
    [6, 4, 0, 6, 1, "CONDITIONING"],
    [7, 5, 0, 6, 2, "CONDITIONING"],
    [8, 6, 0, 7, 0, "LATENT"],
    [9, 7, 0, 8, 0, "IMAGE"]
  ]
}
WFEOF
log "Workflow ComfyUI Wan2.1 salvato"

# =============================================================================
# RIEPILOGO FINALE
# =============================================================================
echo ""
echo "============================================="
echo " Setup completato!"
echo "============================================="
echo ""
echo "Prossimi passi:"
echo "  1. Riavvia il sistema per caricare i moduli kernel AMDGPU:"
echo "     sudo reboot"
echo ""
echo "  2. Dopo il riavvio, avvia ComfyUI:"
echo "     ~/start-comfyui.sh"
echo "     Poi apri il browser: http://localhost:8188"
echo ""
echo "  3. Genera video BikerLink:"
echo "     chmod +x generate.sh && ./generate.sh scripts/navigazione-curvy.txt"
echo ""
echo "Log completo: $LOG_FILE"
echo "Output video: $BIKERLINK_DIR"
