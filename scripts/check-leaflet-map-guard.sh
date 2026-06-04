#!/usr/bin/env bash
# check-leaflet-map-guard.sh
#
# BLINDATURA path mappa Leaflet (mappa HOME).
#
# Perche' esiste:
#   La "mappa nera" del ramo 55.x e' stata causata dalla feature di rotazione
#   due-dita (plugin leaflet-rotate + bussola MapNorthCompass + stato bearing)
#   iniettata nel componente Leaflet InteractiveMap. Quel codice crashava il
#   render PRIMA del try/catch di Leaflet, quindi il componente non montava e
#   non emetteva mai l'evento di telemetria `map_init` -> schermo nero senza
#   alcun errore loggato. Diagnosi costata ~12h.
#
# Cosa fa:
#   Vieta di reintrodurre nel PATH LEAFLET HOME qualsiasi simbolo legato alla
#   rotazione/bussola/bearing. Se uno di questi riappare in uno dei file
#   protetti, la CI fallisce con un messaggio esplicito.
#
# IMPORTANTE — separazione dei renderer:
#   La feature MapLibre 3D nativa (components/MapLibre*.tsx, lib/maplibre/*)
#   USA LEGITTIMAMENTE MapNorthCompass/resetBearing/bearing ed e' una feature
#   SEPARATA e funzionante. Questo guard NON la tocca: scansiona solo la lista
#   esplicita di file Leaflet qui sotto. NON aggiungere file MapLibre a PROTECTED.
#
# Usage:
#   bash scripts/check-leaflet-map-guard.sh
# Exit code:
#   0 — nessuna violazione
#   1 — uno o piu' simboli vietati reintrodotti nel path Leaflet

set -uo pipefail

# --- File del path mappa Leaflet HOME da blindare -------------------------
# (SOLO Leaflet. Mai file MapLibre: usano il compass per design.)
PROTECTED=(
  "components/InteractiveMap.tsx"
  "lib/leaflet-map-html.ts"
  "lib/leaflet-tracking-map-html.ts"
  "lib/leaflet-picker-map-html.ts"
  "components/map/createMapMessageHandler.ts"
)

# --- Simboli vietati (la causa del black map) -----------------------------
# Pattern ERE, case-insensitive. \b approssimato con confini non-parola.
FORBIDDEN=(
  "leaflet-rotate"
  "leaflet_rotate"
  "MapNorthCompass"
  "resetBearing"
  "getMapBearing"
  "rotateend"
  "(^|[^A-Za-z0-9_])bearing([^A-Za-z0-9_]|$)"
)

echo "Running Leaflet map guard (anti black-map regression)..."

VIOLATIONS=""

for f in "${PROTECTED[@]}"; do
  if [ ! -f "$f" ]; then
    # Un file protetto e' sparito: anche questo merita attenzione (rinomina/spostamento).
    VIOLATIONS+="  [MANCANTE] $f — file protetto non trovato (rinominato/spostato?). Aggiorna PROTECTED in scripts/check-leaflet-map-guard.sh.\n"
    continue
  fi
  for pat in "${FORBIDDEN[@]}"; do
    # -n linea, -E ERE, -i case-insensitive
    hits=$(grep -nEi "$pat" "$f" || true)
    if [ -n "$hits" ]; then
      while IFS= read -r line; do
        VIOLATIONS+="  $f:$line   (pattern vietato: ${pat})\n"
      done <<< "$hits"
    fi
  done
done

if [ -n "$VIOLATIONS" ]; then
  echo ""
  echo "  ERRORE — Simbolo vietato reintrodotto nel path mappa LEAFLET:"
  echo ""
  printf "%b" "$VIOLATIONS"
  echo ""
  echo "  Questi simboli (leaflet-rotate / MapNorthCompass / bearing / resetBearing /"
  echo "  getMapBearing / rotateend) hanno gia' causato la MAPPA NERA sul ramo 55.x:"
  echo "  crashano il render del componente Leaflet PRIMA del try/catch interno, quindi"
  echo "  il componente non monta e non emette mai 'map_init' (schermo nero, zero errori)."
  echo ""
  echo "  Se devi aggiungere rotazione/bussola, fallo nel renderer MapLibre 3D"
  echo "  (components/MapLibre*.tsx, lib/maplibre/*), MAI nel path Leaflet home."
  echo "  Vedi .agents/memory/black-map-diagnosis.md per la diagnosi completa."
  echo ""
  exit 1
else
  echo "  ✓ Path mappa Leaflet pulito — nessun simbolo di rotazione/bussola/bearing."
fi
