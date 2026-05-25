export type MapsRollout = "disabled" | "tester" | "all";
export type MapsRendererId = "leaflet" | "maplibre" | "openlayers" | "maplibre-full-3d";
export type MapsTileId = "carto_light" | "carto_dark" | "osm";
export type RoutingEngineId = "graphhopper" | "valhalla" | "mapbox-directions" | "tomtom";
export type RoutingProfileId = "motorcycle" | "car";

export interface MapsOption<T extends string> {
  id: T;
  label: string;
  description: string;
  implemented: boolean;
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
    id: "carto_light",
    label: "Carto Light",
    description: "Tile chiaro CartoDB.",
    implemented: true,
  },
  {
    id: "carto_dark",
    label: "Carto Dark",
    description: "Tile scuro CartoDB.",
    implemented: true,
  },
  {
    id: "osm",
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
    description: "Cloud emergency fallback — 100k richieste/mese gratuiti. Attivare solo se entrambi i self-hosted sono down.",
    implemented: true,
  },
  {
    id: "tomtom",
    label: "TomTom Routing",
    description: "Cloud — profilo motorcycle nativo + traffic real-time EU. 2.500 req/giorno gratuiti.",
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
