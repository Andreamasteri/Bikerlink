#!/usr/bin/env bash
# =============================================================================
# env-helpers.sh — Shared helper functions for BikerLink setup scripts.
#
# Sourced by:
#   - infra/self-host/setup.sh
#   - infra/self-host/setup-missing.sh
#   - infra/self-host/tests/test-check-env-quoted.sh (for regression testing)
#
# Do NOT add code that runs on source — only function definitions.
# =============================================================================

# Stampa un messaggio di errore su stderr e termina lo script con codice 1.
die() { echo -e "\033[31m✗ ERRORE:\033[0m $*" >&2; exit 1; }

# Verifica che ogni valore nel file .env contenente spazi o metacaratteri shell
# sia racchiuso tra virgolette doppie o singole. Se bash `source` trova un valore
# non quotato con spazi o caratteri come ; & | ( ) < > ` questi rompono il parsing.
# Stampa l'elenco delle chiavi problematiche e termina con errore.
check_env_quoted() {
  local envf="$1"
  [[ -r "$envf" ]] || return 0
  # ERE che copre spazi e metacaratteri shell pericolosi
  local UNSAFE='[[:space:];&|()<>`]'
  local bad_keys=()
  while IFS= read -r line; do
    # Ignora commenti e righe vuote
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    # Estrai chiave e valore grezzo
    local key raw_val
    key="${line%%=*}"
    raw_val="${line#*=}"
    # Se il valore contiene caratteri non sicuri e non inizia con " o ' → problema
    if [[ "$raw_val" =~ $UNSAFE && ! "$raw_val" =~ ^[\"\'] ]]; then
      bad_keys+=("$key")
    fi
  done < "$envf"
  if [[ ${#bad_keys[@]} -gt 0 ]]; then
    local keys_list
    keys_list="$(printf '  - %s\n' "${bad_keys[@]}")"
    die "Le seguenti variabili in ${envf} contengono spazi o metacaratteri shell ma non sono tra virgolette:
${keys_list}
       Questo causa un errore al momento del 'source'. Racchiudi il valore tra virgolette doppie:
         KEY=\"valore con spazi o caratteri speciali\"
       Poi rilancia questo script."
  fi
}
