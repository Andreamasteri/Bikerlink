export type MapsRollout = "disabled" | "tester" | "all";
export type MapsRendererId = "leaflet" | "maplibre";
export type MapsTileId = "carto_light" | "carto_dark" | "osm";
export type RoutingEngineId = "graphhopper" | "valhalla" | "mapbox-directions";
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
    description: "Renderer vettoriale WebGL — non ancora implementato.",
    implemented: false,
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
