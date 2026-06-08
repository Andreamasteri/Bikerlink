#!/usr/bin/env bash
# =============================================================================
# BikerLink — Oracle Cloud ARM Instance Poller
# oracle-poller.sh — Loop di retry per creare VM.Standard.A1.Flex Free Tier
#
# Oracle Free Tier ARM è quasi sempre "Out of capacity".
# Questo script tenta in loop ogni 60–300 secondi finché l'istanza non viene
# creata. Gira come servizio systemd sul ThinkCentre (sempre acceso).
#
# CONFIG: ~/.oci/poller.conf (MAI committata nel repo)
# LOG:    /var/log/oracle-poller.log
# =============================================================================

set -uo pipefail

# ── Configurazione default ────────────────────────────────────────────────────
CONF_FILE="${HOME}/.oci/poller.conf"
LOG_FILE="/var/log/oracle-poller.log"
MIN_SLEEP=60
MAX_SLEEP=300

# ── Carica config ─────────────────────────────────────────────────────────────
if [[ ! -f "$CONF_FILE" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: Config non trovata: $CONF_FILE" | tee -a "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Esegui install.sh per creare il template." | tee -a "$LOG_FILE"
    exit 1
fi

# shellcheck source=/dev/null
source "$CONF_FILE"

# ── Variabili obbligatorie ────────────────────────────────────────────────────
: "${OCI_COMPARTMENT_ID:?'OCI_COMPARTMENT_ID non impostato in poller.conf'}"
: "${OCI_SUBNET_ID:?'OCI_SUBNET_ID non impostato in poller.conf'}"
: "${OCI_IMAGE_ID:?'OCI_IMAGE_ID non impostato in poller.conf'}"
: "${OCI_AVAILABILITY_DOMAIN:?'OCI_AVAILABILITY_DOMAIN non impostato in poller.conf'}"

# ── Variabili con default ─────────────────────────────────────────────────────
DISPLAY_NAME="${DISPLAY_NAME:-bikerlink-arm-01}"
OCPU_COUNT="${OCPU_COUNT:-4}"
MEMORY_GB="${MEMORY_GB:-24}"
BOOT_VOLUME_GB="${BOOT_VOLUME_GB:-50}"
SSH_PUBLIC_KEY_FILE="${SSH_PUBLIC_KEY_FILE:-${HOME}/.ssh/id_rsa.pub}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
MIN_SLEEP="${MIN_SLEEP:-60}"
MAX_SLEEP="${MAX_SLEEP:-300}"
# Timeout attesa stato RUNNING dopo creazione (secondi, default 5 minuti)
RUNNING_WAIT_TIMEOUT="${RUNNING_WAIT_TIMEOUT:-300}"

# ── Logging ───────────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_err() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERRORE: $*" | tee -a "$LOG_FILE" >&2
}

# ── Notifiche ─────────────────────────────────────────────────────────────────
notify() {
    local message="$1"
    local sent=0

    if [[ -n "$NTFY_TOPIC" ]]; then
        curl -sf -d "$message" "https://ntfy.sh/${NTFY_TOPIC}" \
            -H "Title: Oracle ARM Poller" \
            -H "Priority: high" \
            -H "Tags: rocket" \
            >/dev/null 2>&1 && sent=1 \
            || log_err "ntfy.sh: invio fallito"
    fi

    if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
        curl -sf \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" \
            >/dev/null 2>&1 && sent=1 \
            || log_err "Telegram: invio fallito"
    fi

    if [[ $sent -eq 0 ]]; then
        log "NOTA: nessun canale di notifica configurato — solo log locale."
    fi
}

# ── Attesa stato RUNNING ───────────────────────────────────────────────────────
# Dopo la creazione, l'istanza è "PROVISIONING" per qualche minuto.
# Questa funzione attende che raggiunga RUNNING prima di uscire con successo.
wait_for_running() {
    local instance_id="$1"
    local elapsed=0
    local poll_interval=15

    log "Attesa stato RUNNING per istanza $instance_id (timeout: ${RUNNING_WAIT_TIMEOUT}s)..."

    while [[ $elapsed -lt $RUNNING_WAIT_TIMEOUT ]]; do
        local lifecycle_state=""
        lifecycle_state=$(oci compute instance get \
            --instance-id "$instance_id" \
            --query 'data."lifecycle-state"' \
            --raw-output 2>/dev/null) || {
            log_err "Impossibile leggere lifecycle-state — riprovo tra ${poll_interval}s"
            sleep "$poll_interval"
            elapsed=$(( elapsed + poll_interval ))
            continue
        }

        log "  Stato istanza: $lifecycle_state (${elapsed}s trascorsi)"

        case "$lifecycle_state" in
            RUNNING)
                log "✓ Istanza in stato RUNNING."
                return 0
                ;;
            TERMINATED|TERMINATING)
                log_err "Istanza terminata inaspettatamente (stato: $lifecycle_state). Riprendo il polling..."
                return 1
                ;;
            PROVISIONING|STARTING)
                # Atteso — continua ad aspettare
                ;;
            *)
                log_err "Stato inatteso: $lifecycle_state — continuo ad attendere..."
                ;;
        esac

        sleep "$poll_interval"
        elapsed=$(( elapsed + poll_interval ))
    done

    log_err "Timeout (${RUNNING_WAIT_TIMEOUT}s) raggiunto senza raggiungere RUNNING."
    log "L'istanza potrebbe comunque avviarsi — controlla la console OCI."
    return 2
}

# ── Verifica OCI CLI ──────────────────────────────────────────────────────────
if ! command -v oci &>/dev/null; then
    log_err "OCI CLI non trovato. Esegui install.sh prima di avviare il poller."
    exit 1
fi

# ── Legge SSH public key ──────────────────────────────────────────────────────
if [[ ! -f "$SSH_PUBLIC_KEY_FILE" ]]; then
    log_err "SSH public key non trovata: $SSH_PUBLIC_KEY_FILE"
    log_err "Genera una chiave con: ssh-keygen -t rsa -b 4096"
    exit 1
fi
SSH_AUTHORIZED_KEYS="$(cat "$SSH_PUBLIC_KEY_FILE")"

# ── Backoff con jitter ────────────────────────────────────────────────────────
random_sleep() {
    local range=$(( MAX_SLEEP - MIN_SLEEP ))
    local jitter=$(( RANDOM % (range + 1) ))
    local secs=$(( MIN_SLEEP + jitter ))
    log "Prossimo tentativo tra ${secs}s (jitter range: ${MIN_SLEEP}–${MAX_SLEEP}s)..."
    sleep "$secs"
}

# ── Loop principale ───────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════════"
log "Oracle ARM Poller avviato"
log "  Shape:               VM.Standard.A1.Flex"
log "  OCPU:                $OCPU_COUNT"
log "  RAM:                 ${MEMORY_GB} GB"
log "  Boot Volume:         ${BOOT_VOLUME_GB} GB"
log "  Availability Domain: $OCI_AVAILABILITY_DOMAIN"
log "  Display Name:        $DISPLAY_NAME"
log "  Backoff:             ${MIN_SLEEP}–${MAX_SLEEP}s"
log "═══════════════════════════════════════════════════════════"

ATTEMPT=0

while true; do
    ATTEMPT=$(( ATTEMPT + 1 ))
    log "Tentativo #${ATTEMPT} — lancio istanza ${DISPLAY_NAME}..."

    # Usa il pattern if/else per catturare l'exit code in modo sicuro per ogni
    # iterazione. Questo evita il bug dove OCI_EXIT stantio di un ciclo
    # precedente viene letto quando il comando ha successo.
    if OCI_OUTPUT=$(oci compute instance launch \
            --compartment-id          "$OCI_COMPARTMENT_ID" \
            --availability-domain     "$OCI_AVAILABILITY_DOMAIN" \
            --subnet-id               "$OCI_SUBNET_ID" \
            --image-id                "$OCI_IMAGE_ID" \
            --shape                   "VM.Standard.A1.Flex" \
            --shape-config            "{\"ocpus\": ${OCPU_COUNT}, \"memoryInGBs\": ${MEMORY_GB}}" \
            --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
            --display-name            "$DISPLAY_NAME" \
            --ssh-authorized-keys     "$SSH_AUTHORIZED_KEYS" \
            --assign-public-ip        true \
            2>&1); then

        # ── Successo: API ha accettato la richiesta ───────────────────────────
        INSTANCE_ID=$(echo "$OCI_OUTPUT" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','N/A'))" \
            2>/dev/null || echo "N/A")
        PUBLIC_IP=$(echo "$OCI_OUTPUT" | python3 -c \
            "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('primaryPublicIpAddress','N/A (controlla console OCI)'))" \
            2>/dev/null || echo "N/A (controlla console OCI)")

        log "✓ Istanza creata al tentativo #${ATTEMPT}!"
        log "  OCID:  $INSTANCE_ID"
        log "  IP:    $PUBLIC_IP"

        # Attendi che l'istanza raggiunga effettivamente lo stato RUNNING
        RUNNING_STATUS=0
        if [[ "$INSTANCE_ID" != "N/A" ]]; then
            wait_for_running "$INSTANCE_ID" || RUNNING_STATUS=$?
        else
            log_err "OCID non estratto dal JSON — skip attesa RUNNING."
        fi

        # Determina IP effettivo (potrebbe non essere disponibile subito)
        if [[ "$PUBLIC_IP" == "N/A"* ]] && [[ "$INSTANCE_ID" != "N/A" ]]; then
            PUBLIC_IP=$(oci compute instance get \
                --instance-id "$INSTANCE_ID" \
                --query 'data."primary-public-ip"' \
                --raw-output 2>/dev/null || echo "N/A (controlla console OCI)")
        fi

        MSG="✅ Oracle ARM pronta! (tentativo #${ATTEMPT})
Istanza: ${DISPLAY_NAME}
OCID: ${INSTANCE_ID}
IP: ${PUBLIC_IP}
Shape: VM.Standard.A1.Flex ${OCPU_COUNT} OCPU / ${MEMORY_GB} GB RAM"

        notify "$MSG"

        if [[ $RUNNING_STATUS -eq 1 ]]; then
            # Istanza terminata — riprendiamo il loop
            log "L'istanza è terminata inaspettatamente. Riprendo il polling..."
            random_sleep
            continue
        fi

        log "Poller terminato — il servizio systemd non verrà riavviato (Restart=on-failure)."
        exit 0

    else
        # ── Fallimento: API ha rifiutato la richiesta ─────────────────────────
        OCI_EXIT=$?
        if echo "$OCI_OUTPUT" | grep -qi "Out of capacity\|InternalError\|Capacity\|capacity"; then
            log "Capacità esaurita (tentativo #${ATTEMPT}). Riprovo..."
        else
            log_err "Errore OCI (exit ${OCI_EXIT}, tentativo #${ATTEMPT}):"
            echo "$OCI_OUTPUT" | while IFS= read -r line; do
                log_err "  $line"
            done
            log "Continuo comunque (errore non bloccante)..."
        fi
    fi

    random_sleep
done
