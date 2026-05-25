import type { MapsRendererId, MapsTileId, RoutingEngineId, RoutingProfileId } from "@shared/maps-config";

interface OptionEntry<T extends string> {
  id: T;
  label: string;
  implemented: boolean;
}

export const AVAILABLE_RENDERERS: OptionEntry<MapsRendererId>[] = [
  { id: "leaflet", label: "Leaflet", implemented: true },
  { id: "maplibre", label: "MapLibre GL", implemented: true },
];

export const AVAILABLE_TILES: OptionEntry<MapsTileId>[] = [
  { id: "carto_light", label: "Carto Light", implemented: true },
  { id: "carto_dark", label: "Carto Dark", implemented: true },
  { id: "osm", label: "OpenStreetMap", implemented: true },
];

export const AVAILABLE_ENGINES: OptionEntry<RoutingEngineId>[] = [
  { id: "graphhopper", label: "GraphHopper", implemented: true },
  { id: "valhalla", label: "Valhalla", implemented: true },
  { id: "mapbox-directions", label: "Mapbox Directions", implemented: true },
  { id: "tomtom", label: "TomTom Routing", implemented: true },
];

export const AVAILABLE_PROFILES: OptionEntry<RoutingProfileId>[] = [
  { id: "motorcycle", label: "Moto", implemented: true },
  { id: "car", label: "Auto", implemented: true },
];

export const DEFAULT_RENDERER: MapsRendererId = "leaflet";
export const DEFAULT_TILE: MapsTileId = "carto_light";
export const DEFAULT_ENGINE: RoutingEngineId = "graphhopper";
export const DEFAULT_PROFILE: RoutingProfileId = "motorcycle";
