#!/usr/bin/env bash
# =============================================================================
# BikerLink Video Pipeline — generate.sh
# Genera video promozionali completi da uno script testuale
#
# Uso:
#   chmod +x generate.sh
#   ./generate.sh scripts/navigazione-curvy.txt
#   ./generate.sh scripts/community-motoclub.txt
#
# Il file script deve avere blocchi nel formato:
#   SCENA: <nome_scena>
#   PROMPT: <descrizione visiva per ComfyUI>
#   NARRAZIONE: <testo per Piper TTS>
#   DURATA: <secondi, default 5>
#   ---
# =============================================================================
set -euo pipefail

# =============================================================================
# CONFIGURAZIONE
# =============================================================================
COMFYUI_URL="http://127.0.0.1:8188"
COMFYUI_DIR="$HOME/ComfyUI"
VENV_DIR="$HOME/comfyui-venv"
PIPER_BIN="$HOME/piper/piper"
PIPER_VOICE="$HOME/piper/voices/it_IT-paola-medium.onnx"
OUTPUT_DIR="$HOME/bikerlink-videos"

# Musica CC0 — scaricata la prima volta
MUSIC_URL="https://cdn.pixabay.com/audio/2024/01/15/audio_8b2b3a6f4e.mp3"
MUSIC_FILE="$OUTPUT_DIR/music/background-cc0.mp3"

# Parametri video output
VIDEO_FPS=24
CLIP_WIDTH=832
CLIP_HEIGHT=480

# Formati export finali
FORMAT_APPSTORE="1080p_h264"       # 1920x1080, H.264 — App Store preview
FORMAT_PLAYSTORE="1080p_mp4"       # 1920x1080, MP4   — Play Store
FORMAT_REELS="reels_9x16"          # 1080x1920, MP4   — Instagram Reels/TikTok

# Colori
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
step() { echo -e "${CYAN}[STEP]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# =============================================================================
# VERIFICA ARGOMENTI
# =============================================================================
if [ $# -lt 1 ]; then
    echo "Uso: $0 <script.txt> [nome_output]"
    echo "Esempio: $0 scripts/navigazione-curvy.txt curvy-video"
    exit 1
fi

SCRIPT_FILE="$1"
VIDEO_NAME="${2:-$(basename "$SCRIPT_FILE" .txt)}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SESSION_DIR="$OUTPUT_DIR/session_${VIDEO_NAME}_${TIMESTAMP}"

[ -f "$SCRIPT_FILE" ] || err "File script non trovato: $SCRIPT_FILE"

# =============================================================================
# VERIFICA DIPENDENZE
# =============================================================================
step "Verifica dipendenze..."

command -v ffmpeg &>/dev/null || err "ffmpeg non trovato. Esegui setup.sh prima."
[ -f "$PIPER_BIN" ]           || err "Piper TTS non trovato in $PIPER_BIN"
[ -f "$PIPER_VOICE" ]         || err "Voce Piper non trovata: $PIPER_VOICE"
[ -d "$VENV_DIR" ]            || err "Virtualenv non trovato: $VENV_DIR. Esegui setup.sh prima."

# Verifica ComfyUI raggiungibile
if ! curl -sf "$COMFYUI_URL/" > /dev/null 2>&1; then
    err "ComfyUI non raggiungibile su $COMFYUI_URL. Avvialo con: ~/start-comfyui.sh"
fi

log "Tutte le dipendenze presenti"

# =============================================================================
# SETUP SESSIONE
# =============================================================================
mkdir -p "$SESSION_DIR"/{clips,voiceover,assembled}
mkdir -p "$OUTPUT_DIR/music" "$OUTPUT_DIR/final"

LOG_FILE="$SESSION_DIR/generate.log"
CLIPS_LIST="$SESSION_DIR/clips.txt"
VOICEOVER_LIST="$SESSION_DIR/voiceover.txt"

echo "=== BikerLink Generate — $VIDEO_NAME — $(date) ===" | tee "$LOG_FILE"

# =============================================================================
# DOWNLOAD MUSICA CC0 (se non già presente)
# =============================================================================
if [ ! -f "$MUSIC_FILE" ]; then
    info "Download musica CC0 da Pixabay..."
    wget -qO "$MUSIC_FILE" "$MUSIC_URL" 2>&1 | tee -a "$LOG_FILE" || {
        warn "Download musica fallito. Cerco alternativa locale..."
        # Genera silenzio come fallback se non c'è rete
        ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 300 \
               -c:a mp3 -b:a 128k "$MUSIC_FILE" -y 2>/dev/null
        warn "Musica sostituita con silenzio (nessuna connessione Internet)"
    }
else
    log "Musica CC0 già presente"
fi

# =============================================================================
# PARSING SCRIPT
# =============================================================================
step "Parsing dello script: $SCRIPT_FILE"

# Estrai blocchi scena in array paralleli
declare -a SCENE_NAMES SCENE_PROMPTS SCENE_NARRATIONS SCENE_DURATIONS

SCENE_COUNT=0
CURRENT_SCENE=""; CURRENT_PROMPT=""; CURRENT_NARR=""; CURRENT_DUR="5"

parse_and_push() {
    if [ -n "$CURRENT_SCENE" ]; then
        SCENE_NAMES+=("$CURRENT_SCENE")
        SCENE_PROMPTS+=("$CURRENT_PROMPT")
        SCENE_NARRATIONS+=("$CURRENT_NARR")
        SCENE_DURATIONS+=("$CURRENT_DUR")
        SCENE_COUNT=$((SCENE_COUNT + 1))
    fi
    CURRENT_SCENE=""; CURRENT_PROMPT=""; CURRENT_NARR=""; CURRENT_DUR="5"
}

while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
        "SCENA: "*)     parse_and_push; CURRENT_SCENE="${line#SCENA: }" ;;
        "PROMPT: "*)    CURRENT_PROMPT="${line#PROMPT: }" ;;
        "NARRAZIONE: "*) CURRENT_NARR="${line#NARRAZIONE: }" ;;
        "DURATA: "*)    CURRENT_DUR="${line#DURATA: }" ;;
        "---")          : ;;
    esac
done < "$SCRIPT_FILE"
parse_and_push  # ultima scena

log "Scene trovate: $SCENE_COUNT"
[ "$SCENE_COUNT" -gt 0 ] || err "Nessuna scena trovata nel file. Verifica il formato."

# =============================================================================
# FUNZIONE: Invia prompt a ComfyUI e attendi il video clip
# =============================================================================
generate_clip() {
    local scene_idx="$1"
    local scene_name="$2"
    local prompt="$3"
    local duration="$4"
    local out_file="$5"

    local frames=$(( duration * VIDEO_FPS ))
    # Wan2.1 genera 81 frame max; adattiamo
    [ "$frames" -gt 81 ] && frames=81

    info "  Generazione clip: $scene_name ($frames frame, ~${duration}s)"

    # Precomputa valori Bash-safe prima dell'heredoc (evita bad-substitution)
    local scene_idx_fmt
    scene_idx_fmt=$(printf '%02d' "$scene_idx")
    local scene_name_safe="${scene_name// /_}"

    # Crea payload API ComfyUI
    local PAYLOAD
    PAYLOAD=$(python3 - << PYEOF
import json, sys

workflow_file = "$COMFYUI_DIR/user/default/workflows/bikerlink-wan21-t2v.json"
with open(workflow_file) as f:
    wf = json.load(f)

# Aggiorna prompt nella scena (nodo 4 = positive prompt)
for node in wf["nodes"]:
    if node["id"] == 4:
        node["widgets_values"][0] = """$prompt, cinematic, 4K, high quality, smooth motion, professional"""
    if node["id"] == 6:
        # frames, width, height
        wv = node["widgets_values"]
        wv[6] = $frames   # frame count
        wv[7] = $CLIP_WIDTH
        wv[8] = $CLIP_HEIGHT
    if node["id"] == 8:
        # filename prefix
        node["widgets_values"][0] = "bikerlink_${scene_idx_fmt}_${scene_name_safe}"

api_payload = {"prompt": {}}
for node in wf["nodes"]:
    nid = str(node["id"])
    api_payload["prompt"][nid] = {
        "class_type": node["type"],
        "inputs": {}
    }
    # inputs da links
    if "inputs" in node:
        for inp in node["inputs"]:
            if "link" in inp and inp["link"] is not None:
                link_id = inp["link"]
                for link in wf["links"]:
                    if link[0] == link_id:
                        api_payload["prompt"][nid]["inputs"][inp["name"]] = [str(link[1]), link[2]]
                        break
    # widget values
    wv_names = []
    if node["type"] == "WanVideoModelLoader":  wv_names = ["ckpt_name", "weight_dtype"]
    elif node["type"] == "CLIPLoader":         wv_names = ["clip_name", "type"]
    elif node["type"] == "WanVideoVAELoader":  wv_names = ["vae_name"]
    elif node["type"] == "CLIPTextEncode":     wv_names = ["text"]
    elif node["type"] == "WanVideoSampler":    wv_names = ["seed","sampler","scheduler","steps","cfg","num_frames","height","width","shift"]
    elif node["type"] == "WanVideoDecode":     wv_names = ["enable_vae_tiling"]
    elif node["type"] == "SaveAnimatedWEBP":   wv_names = ["filename_prefix","fps","lossless","quality","method"]
    if "widgets_values" in node:
        for k, v in zip(wv_names, node.get("widgets_values", [])):
            api_payload["prompt"][nid]["inputs"][k] = v

print(json.dumps(api_payload))
PYEOF
)

    # Invia a ComfyUI
    local RESPONSE
    RESPONSE=$(curl -sf -X POST "$COMFYUI_URL/prompt" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>&1) || { warn "Invio prompt a ComfyUI fallito per scena: $scene_name"; return 1; }

    local PROMPT_ID
    PROMPT_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('prompt_id',''))")
    [ -n "$PROMPT_ID" ] || { warn "prompt_id non ricevuto da ComfyUI"; return 1; }

    info "  prompt_id: $PROMPT_ID — attendo completamento..."

    # Polling fino al completamento (timeout 10 minuti per clip)
    local TIMEOUT=600
    local ELAPSED=0
    while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
        sleep 5
        ELAPSED=$((ELAPSED + 5))
        local STATUS
        STATUS=$(curl -sf "$COMFYUI_URL/history/$PROMPT_ID" 2>/dev/null | \
            python3 -c "
import json, sys
d = json.load(sys.stdin)
pid = '$PROMPT_ID'
if pid in d and 'outputs' in d[pid]:
    print('done')
elif pid in d and 'status' in d[pid] and d[pid]['status'].get('status_str') == 'error':
    print('error')
else:
    print('running')
" 2>/dev/null || echo "running")

        case "$STATUS" in
            done)
                # Trova il webp generato nell'output di ComfyUI
                local WEBP_FILE
                WEBP_FILE=$(find "$COMFYUI_DIR/output" -name "bikerlink_${scene_idx_fmt}_*" \
                    -newer "$SCRIPT_FILE" -type f 2>/dev/null | sort -t_ -k1,1 | tail -1 || true)
                if [ -n "$WEBP_FILE" ]; then
                    # Converti WEBP animato → MP4 via ffmpeg
                    ffmpeg -i "$WEBP_FILE" \
                        -vf "scale=${CLIP_WIDTH}:${CLIP_HEIGHT}:force_original_aspect_ratio=decrease,pad=${CLIP_WIDTH}:${CLIP_HEIGHT}:(ow-iw)/2:(oh-ih)/2" \
                        -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p \
                        -r "$VIDEO_FPS" "$out_file" -y 2>/dev/null
                    log "  Clip generata: $(basename "$out_file")"
                else
                    warn "  Output ComfyUI non trovato per scena: $scene_name"
                    # Genera placeholder nero
                    ffmpeg -f lavfi -i color=c=black:s=${CLIP_WIDTH}x${CLIP_HEIGHT}:r=${VIDEO_FPS} \
                           -t "$duration" -c:v libx264 -pix_fmt yuv420p "$out_file" -y 2>/dev/null
                fi
                return 0
                ;;
            error)
                warn "  ComfyUI ha restituito un errore per scena: $scene_name"
                ffmpeg -f lavfi -i color=c=black:s=${CLIP_WIDTH}x${CLIP_HEIGHT}:r=${VIDEO_FPS} \
                       -t "$duration" -c:v libx264 -pix_fmt yuv420p "$out_file" -y 2>/dev/null
                return 1
                ;;
        esac
    done
    warn "  Timeout per scena: $scene_name"
}

# =============================================================================
# FUNZIONE: Genera voiceover con Piper TTS
# =============================================================================
generate_voice() {
    local text="$1"
    local out_wav="$2"

    echo "$text" | "$PIPER_BIN" \
        --model "$PIPER_VOICE" \
        --output_file "$out_wav" \
        2>/dev/null || {
        warn "Piper TTS fallito, creo silenzio come fallback"
        local dur=3
        ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t "$dur" "$out_wav" -y 2>/dev/null
    }
}

# =============================================================================
# LOOP PRINCIPALE — Genera clip e voiceover per ogni scena
# =============================================================================
step "Generazione clip e voiceover..."
> "$CLIPS_LIST"
> "$VOICEOVER_LIST"

for i in "${!SCENE_NAMES[@]}"; do
    scene_name="${SCENE_NAMES[$i]}"
    prompt="${SCENE_PROMPTS[$i]}"
    narr="${SCENE_NARRATIONS[$i]}"
    dur="${SCENE_DURATIONS[$i]}"
    idx=$((i + 1))

    echo ""
    step "[$idx/$SCENE_COUNT] Scena: $scene_name"

    CLIP_FILE="$SESSION_DIR/clips/clip_$(printf '%02d' $idx).mp4"
    VOICE_WAV="$SESSION_DIR/voiceover/voice_$(printf '%02d' $idx).wav"
    VOICE_MP3="$SESSION_DIR/voiceover/voice_$(printf '%02d' $idx).mp3"

    # 1. Genera clip video
    generate_clip "$idx" "$scene_name" "$prompt" "$dur" "$CLIP_FILE" | tee -a "$LOG_FILE"

    # 2. Genera voiceover
    info "  Sintesi voiceover Piper TTS..."
    generate_voice "$narr" "$VOICE_WAV"
    ffmpeg -i "$VOICE_WAV" -codec:a libmp3lame -qscale:a 3 "$VOICE_MP3" -y 2>/dev/null
    rm -f "$VOICE_WAV"
    log "  Voiceover: $(basename "$VOICE_MP3")"

    # Registra nella lista (estendi clip alla durata voiceover se necessario)
    VOICE_DUR=$(ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$VOICE_MP3" 2>/dev/null || echo "$dur")
    FINAL_DUR=$(python3 -c "print(max($dur, float('$VOICE_DUR') + 0.5))" 2>/dev/null || echo "$dur")

    # Estendi clip alla durata finale se il voiceover è più lungo
    EXTENDED_CLIP="$SESSION_DIR/clips/clip_$(printf '%02d' $idx)_ext.mp4"
    ffmpeg -stream_loop -1 -i "$CLIP_FILE" -t "$FINAL_DUR" \
           -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p \
           "$EXTENDED_CLIP" -y 2>/dev/null
    mv "$EXTENDED_CLIP" "$CLIP_FILE"

    echo "file '$CLIP_FILE'"   >> "$CLIPS_LIST"
    echo "file '$VOICE_MP3'"   >> "$VOICEOVER_LIST"
done

# =============================================================================
# ASSEMBLAGGIO — Concatena clip + Aggiunge voiceover + Musica
# =============================================================================
step "Assemblaggio video finale..."

ASSEMBLED_VIDEO="$SESSION_DIR/assembled/video_raw.mp4"
ASSEMBLED_VOICE="$SESSION_DIR/assembled/voiceover_full.mp3"

# Concatena tutte le clip
ffmpeg -f concat -safe 0 -i "$CLIPS_LIST" \
       -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p \
       "$ASSEMBLED_VIDEO" -y 2>&1 | tee -a "$LOG_FILE"
log "Clip concatenate: $ASSEMBLED_VIDEO"

# Concatena voiceover
ffmpeg -f concat -safe 0 -i "$VOICEOVER_LIST" \
       -codec:a libmp3lame -q:a 3 \
       "$ASSEMBLED_VOICE" -y 2>&1 | tee -a "$LOG_FILE"
log "Voiceover assemblato"

# Durata totale
TOTAL_DUR=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$ASSEMBLED_VIDEO" 2>/dev/null || echo "60")

# Musica loopata alla durata del video, -20 dB
MUSIC_TRIMMED="$SESSION_DIR/assembled/music_looped.mp3"
ffmpeg -stream_loop -1 -i "$MUSIC_FILE" -t "$TOTAL_DUR" \
       -filter:a "volume=-20dB" -c:a libmp3lame -q:a 4 \
       "$MUSIC_TRIMMED" -y 2>&1 | tee -a "$LOG_FILE"

# Mix: video + voiceover (0 dB) + musica (-20 dB)
MIXED_AUDIO="$SESSION_DIR/assembled/audio_mixed.mp3"
ffmpeg -i "$ASSEMBLED_VOICE" -i "$MUSIC_TRIMMED" \
       -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:weights=1 0.15[aout]" \
       -map "[aout]" -c:a libmp3lame -q:a 2 \
       "$MIXED_AUDIO" -y 2>&1 | tee -a "$LOG_FILE"
log "Audio mixato (voiceover + musica -20 dB)"

# =============================================================================
# EXPORT FORMATI FINALI
# =============================================================================
step "Export formati finali..."

FINAL_BASE="$OUTPUT_DIR/final/${VIDEO_NAME}_${TIMESTAMP}"

# --- Formato 1: App Store (1920x1080, H.264, ≤ 500 MB) ---
APP_STORE_FILE="${FINAL_BASE}_appstore_1080p.mp4"
ffmpeg -i "$ASSEMBLED_VIDEO" -i "$MIXED_AUDIO" \
       -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.0 \
       -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" \
       -c:a aac -b:a 192k -ar 44100 \
       -movflags +faststart \
       -shortest "$APP_STORE_FILE" -y 2>&1 | tee -a "$LOG_FILE"
log "App Store: $(basename "$APP_STORE_FILE")"

# --- Formato 2: Play Store (1920x1080, MP4, H.264) ---
PLAY_STORE_FILE="${FINAL_BASE}_playstore_1080p.mp4"
ffmpeg -i "$ASSEMBLED_VIDEO" -i "$MIXED_AUDIO" \
       -c:v libx264 -preset slow -crf 20 -profile:v high -level 4.1 \
       -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" \
       -c:a aac -b:a 128k -ar 44100 \
       -movflags +faststart \
       -shortest "$PLAY_STORE_FILE" -y 2>&1 | tee -a "$LOG_FILE"
log "Play Store: $(basename "$PLAY_STORE_FILE")"

# --- Formato 3: Reels/TikTok (1080x1920, 9:16 verticale) ---
REELS_FILE="${FINAL_BASE}_reels_9x16.mp4"
ffmpeg -i "$ASSEMBLED_VIDEO" -i "$MIXED_AUDIO" \
       -c:v libx264 -preset slow -crf 20 \
       -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
       -c:a aac -b:a 128k -ar 44100 \
       -movflags +faststart \
       -shortest "$REELS_FILE" -y 2>&1 | tee -a "$LOG_FILE"
log "Reels 9:16: $(basename "$REELS_FILE")"

# =============================================================================
# RIEPILOGO
# =============================================================================
echo ""
echo "============================================="
echo " Video BikerLink generato con successo!"
echo "============================================="
echo ""
echo " Scene elaborate: $SCENE_COUNT"
echo " Durata totale:   ~${TOTAL_DUR}s"
echo ""
echo " Output files:"
echo "   App Store → $(basename "$APP_STORE_FILE")"
echo "   Play Store → $(basename "$PLAY_STORE_FILE")"
echo "   Reels 9:16 → $(basename "$REELS_FILE")"
echo ""
echo " Directory output: $OUTPUT_DIR/final/"
echo " Log sessione:     $LOG_FILE"
echo ""
echo " Prossimo video:"
echo "   ./generate.sh scripts/community-motoclub.txt"
