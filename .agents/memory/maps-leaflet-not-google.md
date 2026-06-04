---
name: Mappe — Leaflet/OSM, NON Google Maps
description: BikerLink usa Leaflet via WebView con tile OSM per tutte le mappe; react-native-maps/Google Maps è stato deliberatamente escluso.
---

# Mappe: Leaflet via WebView, non Google Maps

Tutte le mappe dell'app sono rese con **Leaflet dentro una WebView** (`react-native-webview`)
caricando tile OSM. Componenti: `LeafletRouteMap`, `LeafletPickerMap`, `LeafletMiniMap`,
`LeafletTrackingMap`, più gli HTML builder in `lib/leaflet-*.ts` e `lib/leaflet/`.
La sorgente tile è gestita da `useMapConfig()` (`lib/map-context`): tile self-hosted dal
ThinkCentre quando attivo, fallback `basemaps.cartocdn.com/dark_all` quando disabilitato.

**Why:** `react-native-maps` (Google Maps) è stato **deliberatamente escluso** per stabilità,
peso dell'app e costi (richiede API key Google + SDK nativo + rebuild). Leaflet via WebView è
JS puro → si distribuisce via **OTA** senza rebuild nativo, niente API key, niente costi.

**How to apply:** non aggiungere mai `react-native-maps` né config `android.config.googleMaps`
in app.json né `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (quel secret aveva un valore placeholder finto
→ causa la "mappa nera"). Per un nuovo picker di coordinate usa `LeafletPickerMap`
(`onCoordPicked` → {latitude,longitude}); per un display read-only di un punto usa
`LeafletMiniMap` (passa `height`, es. misurata via onLayout dentro contenitori flex:1).
