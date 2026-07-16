export type MapsRollout = "disabled" | "tester" | "all";
export type MapsRendererId = "leaflet" | "maplibre" | "openlayers" | "maplibre-full-3d";
export type MapsTileId = "carto-light" | "carto-dark" | "osm-standard";
export type RoutingEngineId = "graphhopper" | "valhalla" | "mapbox-directions" | "tomtom" | "ai";
export type RoutingProfileId = "motorcycle" | "car";

export interface MapsOption<T extends string> {
  id: T;
  label: string;
  description: string;
  implemented: boolean;
  archived?: boolean;
}

export const RENDERER_OPTIONS: MapsOption<MapsRendererId>[] = [
  {
    id: "leaflet",
    label: "Leaflet",
    description: "Renderer attuale — stabile, basato su HTML/JS.",
    implemented: true,
  },
  {
    id: "maplibre",
    label: "MapLibre GL",
    description: "Renderer vettoriale WebGL — MapLibre GL minimal (2D, nessun 3D).",
    implemented: true,
  },
  {
    id: "openlayers",
    label: "OpenLayers",
    description: "Renderer Canvas/WebGL — ottimizzato per 5.000+ marker simultanei.",
    implemented: true,
  },
  {
    id: "maplibre-full-3d",
    label: "MapLibre GL 3D",
    description: "Renderer premium 3D — terrain, hillshade, satellite toggle. Solo web desktop.",
    implemented: true,
  },
];

export const TILE_OPTIONS: MapsOption<MapsTileId>[] = [
  {
    id: "carto-light",
    label: "Carto Light",
    description: "Tile chiaro CartoDB.",
    implemented: true,
  },
  {
    id: "carto-dark",
    label: "Carto Dark",
    description: "Tile scuro CartoDB.",
    implemented: true,
  },
  {
    id: "osm-standard",
    label: "OpenStreetMap",
    description: "Tile standard OSM.",
    implemented: true,
  },
];

export const ROUTING_OPTIONS: MapsOption<RoutingEngineId>[] = [
  {
    id: "graphhopper",
    label: "GraphHopper",
    description: "Engine di routing principale — self-hosted.",
    implemented: true,
  },
  {
    id: "valhalla",
    label: "Valhalla",
    description: "Engine alternativo OSM — self-hosted, profilo motorcycle nativo.",
    implemented: true,
  },
  {
    id: "mapbox-directions",
    label: "Mapbox Directions",
    description: "Archiviato — duplicato di TomTom come fallback cloud. Ignorato anche se impostato nel DB.",
    implemented: false,
    archived: true,
  },
  {
    id: "tomtom",
    label: "TomTom Routing",
    description: "Cloud — profilo motorcycle nativo + traffic real-time EU. 2.500 req/giorno gratuiti.",
    implemented: true,
  },
  {
    id: "ai",
    label: "AI (auto-selezione)",
    description: "Un modello AI sceglie l'engine self-hosted ottimale per ogni richiesta (Task #164: default versionato per la funzione routing). Fallback deterministico → Valhalla se l'AI non risponde.",
    implemented: true,
  },
];

export const ROUTING_PROFILE_OPTIONS: MapsOption<RoutingProfileId>[] = [
  {
    id: "motorcycle",
    label: "Moto",
    description: "Profilo moto (richiede server self-hosted).",
    implemented: true,
  },
  {
    id: "car",
    label: "Auto",
    description: "Profilo auto (disponibile anche su Cloud API).",
    implemented: true,
  },
];

/**
 * Engine ignorati nella catena di fallback del router anche se impostati nel DB.
 * Derivato da ROUTING_OPTIONS.archived — include mapbox-directions e ai.
 */
export const ARCHIVED_ROUTING_ENGINES = new Set<RoutingEngineId>(
  ROUTING_OPTIONS.filter((o) => o.archived).map((o) => o.id),
);
