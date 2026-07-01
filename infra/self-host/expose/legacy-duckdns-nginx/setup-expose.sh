#!/usr/bin/env bash
# =============================================================================
# BikerLink — expose/setup-expose.sh
# Genera i file di configurazione per esporre i servizi self-host (GraphHopper,
# Valhalla, Ollama, Whisper, Nominatim) all'app cloud, compilando i segnaposto
# nei template a partire dai valori del .env.local.
#
# Cosa fa:
#   1. Legge i token dal .env.local.
#   2. Chiede/legge dominio base, origin web (CORS) e UUID del tunnel Cloudflare.
#   3. Valida che i token forniti coincidano con quelli del .env.local.
#   4. Produce i config compilati (senza segnaposto):
#        - generated/nginx-bikerlink.conf
#        - generated/cloudflared-config.yml
#   I file template originali restano intatti come riferimento.
#
# Uso:
#   chmod +x setup-expose.sh && ./setup-expose.sh
#   ./setup-expose.sh --gen-tokens   # genera i token mancanti e li scrive nel .env.local
#
# Variabili d'ambiente per modalità non-interattiva (CI / scripting):
#   BASE_DOMAIN, APP_ORIGIN, TUNNEL_UUID,
#   GRAPHHOPPER_TOKEN, VALHALLA_API_KEY,
#   OLLAMA_TOKEN, WHISPER_TOKEN, NOMINATIM_TOKEN,
#   ENV_LOCAL_FILE, NONINTERACTIVE=1, GEN_TOKENS=1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Argomenti CLI ─────────────────────────────────────────────────────────────
GEN_TOKENS="${GEN_TOKENS:-0}"
for arg in "$@"; do
  case "$arg" in
    --gen-tokens) GEN_TOKENS=1 ;;
    -h|--help)
      echo "Uso: $0 [--gen-tokens]"
      echo "  --gen-tokens   Genera automaticamente i token mancanti/placeholder"
      echo "                 (openssl rand -base64 32) e li scrive nel .env.local."
      exit 0 ;;
    *) echo "Argomento sconosciuto: $arg (usa --help)" >&2; exit 2 ;;
  esac
done

ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${SCRIPT_DIR}/../.env.local}"
NGINX_TEMPLATE="${SCRIPT_DIR}/nginx-bikerlink.conf"
CLOUDFLARED_TEMPLATE="${SCRIPT_DIR}/cloudflared-config.yml"
OUT_DIR="${SCRIPT_DIR}/generated"
NGINX_OUT="${OUT_DIR}/nginx-bikerlink.conf"
CLOUDFLARED_OUT="${OUT_DIR}/cloudflared-config.yml"
PLACEHOLDER_VALUE="<INSERIRE>"

NONINTERACTIVE="${NONINTERACTIVE:-0}"

# ── Estetica (coerente con setup.sh) ──────────────────────────────────────────
bold()  { echo -e "\033[1m$*\033[0m"; }
ok()    { echo -e "  \033[32m✓\033[0m $*"; }
warn()  { echo -e "  \033[33m!\033[0m $*"; }
info()  { echo -e "  \033[36m→\033[0m $*"; }
die()   { echo -e "\033[31m✗ ERRORE:\033[0m $*" >&2; exit 1; }
section() { echo; bold "━━━ $* ━━━"; }

# Legge il valore di una chiave da un file .env (ultima occorrenza, trim quote).
read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# Chiede un valore all'utente con default opzionale; rispetta NONINTERACTIVE.
ask() {
  local prompt="$1" default="${2:-}" reply
  if [[ "$NONINTERACTIVE" == "1" ]]; then
    printf '%s' "$default"; return 0
  fi
  if [[ -n "$default" ]]; then
    read -r -p "  ${prompt} [${default}]: " reply
    printf '%s' "${reply:-$default}"
  else
    read -r -p "  ${prompt}: " reply
    printf '%s' "$reply"
  fi
}

# Escape per sed (sostituzione sicura su separatore '#').
sed_escape() { printf '%s' "$1" | sed -e 's/[\#&]/\\&/g'; }

# Genera un token casuale robusto (32 byte base64).
gen_token() {
  command -v openssl >/dev/null 2>&1 || die "openssl non disponibile: impossibile generare token."
  openssl rand -base64 32
}

# Inserisce/aggiorna una chiave nel file .env.local (crea il file se assente).
upsert_env_value() {
  local key="$1" value="$2" file="$3" tmp esc_val
  if [[ ! -e "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    : > "$file"
  fi
  [[ -w "$file" ]] || die "Impossibile scrivere su $file (permessi?)."
  esc_val="$(sed_escape "$value")"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    tmp="$(mktemp)"
    sed -E "s#^[[:space:]]*${key}=.*#${key}=${esc_val}#" "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
section "1/5 — Verifica template e .env.local"
# ─────────────────────────────────────────────────────────────────────────────
[[ -f "$NGINX_TEMPLATE" ]]       || die "Template Nginx non trovato: $NGINX_TEMPLATE"
[[ -f "$CLOUDFLARED_TEMPLATE" ]] || die "Template cloudflared non trovato: $CLOUDFLARED_TEMPLATE"
ok "Template trovati (nginx-bikerlink.conf, cloudflared-config.yml)"

if [[ -r "$ENV_LOCAL_FILE" ]]; then
  ok ".env.local trovato: $ENV_LOCAL_FILE"
else
  warn ".env.local non trovato in $ENV_LOCAL_FILE — i token andranno inseriti a mano."
fi

# Token attesi (dal .env.local). Possono essere vuoti o placeholder.
ENV_GH_TOKEN="$(read_env_value GRAPHHOPPER_TOKEN  "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_VALHALLA_KEY="$(read_env_value VALHALLA_API_KEY "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_OLLAMA_TOKEN="$(read_env_value OLLAMA_TOKEN     "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_WHISPER_TOKEN="$(read_env_value WHISPER_TOKEN   "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_NOMINATIM_TOKEN="$(read_env_value NOMINATIM_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_TC_AGENT_TOKEN="$(read_env_value TC_AGENT_TOKEN  "$ENV_LOCAL_FILE" 2>/dev/null || true)"

# ─────────────────────────────────────────────────────────────────────────────
section "2/5 — Parametri di esposizione"
# ─────────────────────────────────────────────────────────────────────────────
BASE_DOMAIN="${BASE_DOMAIN:-$(ask "Dominio base (es: biker-link.net)")}"
[[ -n "$BASE_DOMAIN" ]] || die "Dominio base obbligatorio."
[[ "$BASE_DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] \
  || warn "Il dominio '$BASE_DOMAIN' non sembra valido: procedo comunque."

APP_ORIGIN="${APP_ORIGIN:-$(ask "Origin web autorizzato per CORS" "https://${BASE_DOMAIN}")}"
TUNNEL_UUID="${TUNNEL_UUID:-$(ask "Tunnel UUID Cloudflare (vuoto se usi solo Nginx locale)")}"

ok "Dominio:     $BASE_DOMAIN"
ok "App origin:  $APP_ORIGIN"
if [[ -n "$TUNNEL_UUID" ]]; then
  ok "Tunnel UUID: $TUNNEL_UUID"
else
  warn "Tunnel UUID non fornito: il file cloudflared resterà con __TUNNEL_UUID__ da compilare."
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/5 — Token e validazione con .env.local"
# ─────────────────────────────────────────────────────────────────────────────
GENERATED_ANY=0
should_generate() {
  local name="$1"
  if [[ "$GEN_TOKENS" == "1" ]]; then
    return 0
  fi
  if [[ "$NONINTERACTIVE" == "1" ]]; then
    return 1
  fi
  local reply
  reply="$(ask "${name} assente: vuoi generarlo automaticamente e salvarlo nel .env.local? [s/N]" "N")"
  [[ "$reply" =~ ^[sSyY]$ ]]
}

RESOLVED_TOKEN=""
resolve_token() {
  local name="$1" env_val="$2" provided="${3:-}"
  if [[ -n "$provided" && "$provided" != "$PLACEHOLDER_VALUE" ]]; then
    RESOLVED_TOKEN="$provided"
  elif [[ -n "$env_val" && "$env_val" != "$PLACEHOLDER_VALUE" ]]; then
    RESOLVED_TOKEN="$env_val"
  elif should_generate "$name"; then
    RESOLVED_TOKEN="$(gen_token)"
    upsert_env_value "$name" "$RESOLVED_TOKEN" "$ENV_LOCAL_FILE"
    GENERATED_ANY=1
    info "${name} generato e scritto in ${ENV_LOCAL_FILE}"
  else
    RESOLVED_TOKEN="$(ask "Inserisci ${name}")"
  fi
}

resolve_token "GRAPHHOPPER_TOKEN" "$ENV_GH_TOKEN"       "${GRAPHHOPPER_TOKEN:-}"
GH_TOKEN="$RESOLVED_TOKEN"
resolve_token "VALHALLA_API_KEY"  "$ENV_VALHALLA_KEY"   "${VALHALLA_API_KEY:-}"
VALHALLA_KEY="$RESOLVED_TOKEN"
resolve_token "OLLAMA_TOKEN"      "$ENV_OLLAMA_TOKEN"   "${OLLAMA_TOKEN:-}"
OLLAMA_TOKEN_VAL="$RESOLVED_TOKEN"
resolve_token "WHISPER_TOKEN"     "$ENV_WHISPER_TOKEN"  "${WHISPER_TOKEN:-}"
WHISPER_TOKEN_VAL="$RESOLVED_TOKEN"
resolve_token "NOMINATIM_TOKEN"   "$ENV_NOMINATIM_TOKEN" "${NOMINATIM_TOKEN:-}"
NOMINATIM_TOKEN_VAL="$RESOLVED_TOKEN"
resolve_token "TC_AGENT_TOKEN"    "$ENV_TC_AGENT_TOKEN"  "${TC_AGENT_TOKEN:-}"
TC_AGENT_TOKEN_VAL="$RESOLVED_TOKEN"

# Se abbiamo generato token, rileggiamo i valori dal .env.local così la
# validazione successiva li riconosce come coincidenti (non più placeholder).
if [[ "$GENERATED_ANY" == "1" ]]; then
  ENV_GH_TOKEN="$(read_env_value GRAPHHOPPER_TOKEN  "$ENV_LOCAL_FILE" 2>/dev/null || true)"
  ENV_VALHALLA_KEY="$(read_env_value VALHALLA_API_KEY "$ENV_LOCAL_FILE" 2>/dev/null || true)"
  ENV_OLLAMA_TOKEN="$(read_env_value OLLAMA_TOKEN     "$ENV_LOCAL_FILE" 2>/dev/null || true)"
  ENV_WHISPER_TOKEN="$(read_env_value WHISPER_TOKEN   "$ENV_LOCAL_FILE" 2>/dev/null || true)"
  ENV_NOMINATIM_TOKEN="$(read_env_value NOMINATIM_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)"
  ENV_TC_AGENT_TOKEN="$(read_env_value TC_AGENT_TOKEN  "$ENV_LOCAL_FILE" 2>/dev/null || true)"
fi

[[ -n "$GH_TOKEN"           && "$GH_TOKEN"           != "$PLACEHOLDER_VALUE" ]] \
  || die "GRAPHHOPPER_TOKEN mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"
[[ -n "$VALHALLA_KEY"       && "$VALHALLA_KEY"        != "$PLACEHOLDER_VALUE" ]] \
  || die "VALHALLA_API_KEY mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"
[[ -n "$OLLAMA_TOKEN_VAL"   && "$OLLAMA_TOKEN_VAL"    != "$PLACEHOLDER_VALUE" ]] \
  || die "OLLAMA_TOKEN mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"
[[ -n "$WHISPER_TOKEN_VAL"  && "$WHISPER_TOKEN_VAL"   != "$PLACEHOLDER_VALUE" ]] \
  || die "WHISPER_TOKEN mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"
[[ -n "$NOMINATIM_TOKEN_VAL" && "$NOMINATIM_TOKEN_VAL" != "$PLACEHOLDER_VALUE" ]] \
  || die "NOMINATIM_TOKEN mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"
[[ -n "$TC_AGENT_TOKEN_VAL"  && "$TC_AGENT_TOKEN_VAL"  != "$PLACEHOLDER_VALUE" ]] \
  || die "TC_AGENT_TOKEN mancante. Generane uno con: openssl rand -base64 32 (o riesegui con --gen-tokens)"

# Validazione: i token usati devono coincidere con quelli del .env.local.
# Disabilitabile con SKIP_TOKEN_VALIDATION=1.
validate_token() {
  local name="$1" used="$2" env_val="$3"
  if [[ -z "$env_val" || "$env_val" == "$PLACEHOLDER_VALUE" ]]; then
    warn "${name} non valorizzato nel .env.local: salto la validazione di coincidenza."
    return 0
  fi
  if [[ "$used" == "$env_val" ]]; then
    ok "${name} coincide con .env.local"
  else
    if [[ "${SKIP_TOKEN_VALIDATION:-0}" == "1" ]]; then
      warn "${name} NON coincide con .env.local (validazione ignorata: SKIP_TOKEN_VALIDATION=1)."
    else
      die "${name} non coincide con .env.local. Il proxy e l'app userebbero token diversi (401).
       Allinea i valori o riesegui con SKIP_TOKEN_VALIDATION=1 per forzare."
    fi
  fi
}

validate_token "GRAPHHOPPER_TOKEN" "$GH_TOKEN"           "$ENV_GH_TOKEN"
validate_token "VALHALLA_API_KEY"  "$VALHALLA_KEY"       "$ENV_VALHALLA_KEY"
validate_token "OLLAMA_TOKEN"      "$OLLAMA_TOKEN_VAL"   "$ENV_OLLAMA_TOKEN"
validate_token "WHISPER_TOKEN"     "$WHISPER_TOKEN_VAL"  "$ENV_WHISPER_TOKEN"
validate_token "NOMINATIM_TOKEN"   "$NOMINATIM_TOKEN_VAL" "$ENV_NOMINATIM_TOKEN"
validate_token "TC_AGENT_TOKEN"    "$TC_AGENT_TOKEN_VAL"  "$ENV_TC_AGENT_TOKEN"

# ─────────────────────────────────────────────────────────────────────────────
section "4/5 — Generazione config compilati"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"

E_BASE_DOMAIN="$(sed_escape "$BASE_DOMAIN")"
E_APP_ORIGIN="$(sed_escape "$APP_ORIGIN")"
E_GH_TOKEN="$(sed_escape "$GH_TOKEN")"
E_VALHALLA_KEY="$(sed_escape "$VALHALLA_KEY")"
E_OLLAMA_TOKEN="$(sed_escape "$OLLAMA_TOKEN_VAL")"
E_WHISPER_TOKEN="$(sed_escape "$WHISPER_TOKEN_VAL")"
E_NOMINATIM_TOKEN="$(sed_escape "$NOMINATIM_TOKEN_VAL")"
E_TC_AGENT_TOKEN="$(sed_escape "$TC_AGENT_TOKEN_VAL")"
E_TUNNEL_UUID="$(sed_escape "${TUNNEL_UUID:-__TUNNEL_UUID__}")"

# Nginx
sed \
  -e "s#__BASE_DOMAIN__#${E_BASE_DOMAIN}#g" \
  -e "s#__APP_ORIGIN__#${E_APP_ORIGIN}#g" \
  -e "s#__GH_TOKEN__#${E_GH_TOKEN}#g" \
  -e "s#__VALHALLA_KEY__#${E_VALHALLA_KEY}#g" \
  -e "s#__OLLAMA_TOKEN__#${E_OLLAMA_TOKEN}#g" \
  -e "s#__WHISPER_TOKEN__#${E_WHISPER_TOKEN}#g" \
  -e "s#__NOMINATIM_TOKEN__#${E_NOMINATIM_TOKEN}#g" \
  -e "s#__TC_AGENT_TOKEN__#${E_TC_AGENT_TOKEN}#g" \
  "$NGINX_TEMPLATE" > "$NGINX_OUT"
chmod 600 "$NGINX_OUT"
ok "Generato $NGINX_OUT"

# Cloudflared
sed \
  -e "s#__TUNNEL_UUID__#${E_TUNNEL_UUID}#g" \
  -e "s#__BASE_DOMAIN__#${E_BASE_DOMAIN}#g" \
  "$CLOUDFLARED_TEMPLATE" > "$CLOUDFLARED_OUT"
chmod 600 "$CLOUDFLARED_OUT"
ok "Generato $CLOUDFLARED_OUT"

# Avviso se restano segnaposto non risolti (es. TUNNEL_UUID lasciato vuoto).
if grep -q "__[A-Z_]*__" "$NGINX_OUT" "$CLOUDFLARED_OUT" 2>/dev/null; then
  warn "Restano segnaposto non risolti nei file generati:"
  grep -ho "__[A-Z_]*__" "$NGINX_OUT" "$CLOUDFLARED_OUT" | sort -u | sed 's/^/      /'
fi

cat <<EOF

$(bold "Config pronti in: ${OUT_DIR}")

$(bold "Nginx + Let's Encrypt (setup legacy — l'esposizione attiva è Cloudflare Tunnel)")
  # 1. Ferma nginx prima di chiedere il certificato (challenge HTTP-01 porta 80)
  sudo systemctl stop nginx

  # 2. Emetti il certificato SAN unico (--cert-name bikerlink = lineage fisso)
  sudo certbot certonly --standalone --cert-name bikerlink \\
    -d gh.${BASE_DOMAIN} -d valhalla.${BASE_DOMAIN} \\
    -d ollama.${BASE_DOMAIN} -d whisper.${BASE_DOMAIN} \\
    -d nominatim.${BASE_DOMAIN} -d tc.${BASE_DOMAIN}

  # 3. Installa il config e avvia nginx
  sudo cp ${NGINX_OUT} /etc/nginx/sites-available/bikerlink
  sudo ln -sf /etc/nginx/sites-available/bikerlink /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx

$(bold "Cloudflare Tunnel")
  sudo cp ${CLOUDFLARED_OUT} /etc/cloudflared/config.yml
  sudo cloudflared service install
  sudo systemctl enable --now cloudflared

$(bold "Log auth-failure (401 token mismatch)")
  Ogni servizio scrive i 401 da token errato in un log dedicato separato dall'access log:
    /var/log/nginx/gh-auth-fail.log
    /var/log/nginx/valhalla-auth-fail.log
    /var/log/nginx/ollama-auth-fail.log
    /var/log/nginx/whisper-auth-fail.log
    /var/log/nginx/nominatim-auth-fail.log
    /var/log/nginx/tc-auth-fail.log
  Formato: timestamp | IP | request | header custom mascherato (4 char + ***) | Authorization mascherata
  Lettura 401 in tempo reale (es. GraphHopper):
    sudo tail -f /var/log/nginx/gh-auth-fail.log
  Come interpretare le righe:
    header=XXXX*** → token presente ma sbagliato (i 4 char aiutano a confrontare con .env.local)
    header=-        → header assente: il client non ha inviato quel campo
    authorization=Bearer XXXX*** → il client ha usato Bearer invece dell'header custom
  Nessuna riga = nessun 401 → il token è corretto (o il servizio non è stato contattato).

$(bold "Nota")
  $(if [[ "$GENERATED_ANY" == "1" ]]; then printf 'Token generati e salvati in %s (riusati nei config). ' "$ENV_LOCAL_FILE"; fi)I file contengono i token in chiaro (chmod 600). NON committarli.
  La cartella generated/ è ignorata da git.

$(bold "Secrets Replit da aggiornare")
  OLLAMA_URL=https://ollama.${BASE_DOMAIN}
  OLLAMA_TOKEN=<valore da .env.local>
  WHISPER_URL=https://whisper.${BASE_DOMAIN}
  WHISPER_TOKEN=<valore da .env.local>
  NOMINATIM_URL=https://nominatim.${BASE_DOMAIN}
  NOMINATIM_TOKEN=<valore da .env.local>
  GRAPHHOPPER_URL=https://gh.${BASE_DOMAIN}
  GRAPHHOPPER_TOKEN=<valore da .env.local>
  VALHALLA_URL=https://valhalla.${BASE_DOMAIN}
  VALHALLA_API_KEY=<valore da .env.local>
  THINKCENTRE_METRICS_URL=https://tc.${BASE_DOMAIN}
  THINKCENTRE_AGENT_TOKEN=<valore da .env.local (TC_AGENT_TOKEN)>
  # Probe infra via TC agent (nessun token aggiuntivo: usano THINKCENTRE_AGENT_TOKEN)
  NGINX_MONITOR_URL=https://tc.${BASE_DOMAIN}/probe/nginx
  PGADMIN_URL=https://tc.${BASE_DOMAIN}/probe/pgadmin
  UPTIME_KUMA_URL=https://tc.${BASE_DOMAIN}/probe/uptime-kuma
  REDIS_PROBE_URL=https://tc.${BASE_DOMAIN}/probe/redis

EOF
# ─────────────────────────────────────────────────────────────────────────────
section "5/5 — Directory eventi watchdog"
# ─────────────────────────────────────────────────────────────────────────────
# /var/lib/bikerlink/ è la home dei file di stato del watchdog (es. watchdog-events.jsonl).
# Il watchdog la crea al runtime, ma pre-crearla qui garantisce che il servizio
# systemd (che può girare come utente ristretto) abbia sempre i permessi giusti
# fin dal primo avvio, senza dipendere dall'ordine di esecuzione.
# Sovrascrivibile via AREAS_EVENTS_FILE nel file /etc/bikerlink-areas.env.
BIKERLINK_VAR_DIR="${BIKERLINK_VAR_DIR:-/var/lib/bikerlink}"
if [[ -d "$BIKERLINK_VAR_DIR" ]]; then
  ok "Directory eventi già esistente: $BIKERLINK_VAR_DIR"
else
  if sudo mkdir -p "$BIKERLINK_VAR_DIR" 2>/dev/null \
      && sudo chown root:root "$BIKERLINK_VAR_DIR" \
      && sudo chmod 755 "$BIKERLINK_VAR_DIR"; then
    ok "Creata $BIKERLINK_VAR_DIR (proprietario: root, permessi: 755)"
  else
    warn "Impossibile creare $BIKERLINK_VAR_DIR (sudo mancante o non interattivo)."
    info "Crea la directory manualmente prima di avviare il servizio:"
    info "  sudo mkdir -p $BIKERLINK_VAR_DIR && sudo chmod 755 $BIKERLINK_VAR_DIR"
    info "Il watchdog tenta di crearla al runtime, ma il servizio potrebbe fallire"
    info "se gira come utente ristretto senza permessi di scrittura in /var/lib/."
  fi
fi

ok "Fatto."
