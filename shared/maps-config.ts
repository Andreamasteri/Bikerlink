export type MapsRollout = "disabled" | "tester" | "all";

export type MapsRendererId =
  | "leaflet"
  | "maplibre_minimal"
  | "maplibre_full_3d"
  | "openlayers"
  | "cesium_web";

export type MapsTileId =
  | "carto_light"
  | "carto_dark"
  | "esri_gray"
  | "esri_world_imagery"
  | "esri_world_topo"
  | "esri_natgeo"
  | "opentopomap"
  | "maptiler_hybrid"
  | "maptiler_topo"
  | "maptiler_outdoor"
  | "thunderforest_outdoors"
  | "thunderforest_opencyclemap"
  | "stadia_alidade_smooth"
  | "stamen_toner"
  | "stamen_watercolor"
  | "stamen_terrain"
  | "osm_standard"
  | "openweathermap_overlay";

export type RoutingEngineId =
  | "graphhopper"
  | "valhalla"
  | "mapbox"
  | "tomtom";

export type RoutingProfileId =
  | "moto-curvy"
  | "fast"
  | "scenic"
  | "off-road";

export interface MapsOption<T extends string> {
  id: T;
  label: string;
  description: string;
  implemented: boolean;
  category?: string;
}

export const ROLLOUT_VALUES: ReadonlyArray<MapsRollout> = ["disabled", "tester", "all"];

export const RENDERER_OPTIONS: ReadonlyArray<MapsOption<MapsRendererId>> = [
  { id: "leaflet", label: "Leaflet (classico)", description: "Renderer stabile attuale, basato su WebView Leaflet.js. Default produzione.", implemented: true },
  { id: "maplibre_minimal", label: "MapLibre GL Minimal", description: "Renderer vettoriale leggero per WebView mobile. Performance migliore con tile vector.", implemented: false },
  { id: "maplibre_full_3d", label: "MapLibre GL Full 3D", description: "Renderer 3D completo per desktop web. Tilt, pitch, edifici 3D.", implemented: false },
  { id: "openlayers", label: "OpenLayers", description: "Renderer alternativo ottimizzato per molti marker simultanei.", implemented: false },
  { id: "cesium_web", label: "CesiumJS (web desktop)", description: "Renderer 3D premium per planner desktop. Globo terrestre, terreno 3D.", implemented: false },
];

export const TILE_OPTIONS: ReadonlyArray<MapsOption<MapsTileId>> = [
  { id: "carto_light", label: "Carto Light", description: "Carto Light — base chiara minimalista (default).", implemented: true, category: "Standard" },
  { id: "carto_dark", label: "Carto Dark", description: "Carto Dark — base scura minimalista.", implemented: true, category: "Standard" },
  { id: "osm_standard", label: "OpenStreetMap", description: "OSM standard — base colorata completa.", implemented: false, category: "Standard" },
  { id: "esri_gray", label: "Esri Gray", description: "Esri World Gray — base neutra.", implemented: true, category: "Standard" },
  { id: "opentopomap", label: "OpenTopoMap", description: "Topografica con curve di livello (gratuita).", implemented: false, category: "Topo" },
  { id: "esri_world_topo", label: "Esri World Topo", description: "Topografica Esri con copertura globale.", implemented: false, category: "Topo" },
  { id: "maptiler_topo", label: "MapTiler Topo", description: "Topografica MapTiler — richiede API key (freemium).", implemented: false, category: "Topo" },
  { id: "thunderforest_outdoors", label: "Thunderforest Outdoors", description: "Outdoor con sentieri (freemium).", implemented: false, category: "Topo" },
  { id: "thunderforest_opencyclemap", label: "Thunderforest OpenCycleMap", description: "Ciclabili e sentieri moto (freemium).", implemented: false, category: "Topo" },
  { id: "esri_world_imagery", label: "Esri World Imagery", description: "Satellite globale Esri (gratuito).", implemented: false, category: "Satellite" },
  { id: "maptiler_hybrid", label: "MapTiler Hybrid", description: "Satellite + etichette stradali (freemium).", implemented: false, category: "Satellite" },
  { id: "maptiler_outdoor", label: "MapTiler Outdoor", description: "MapTiler outdoor terrain (freemium).", implemented: false, category: "Topo" },
  { id: "esri_natgeo", label: "Esri NatGeo", description: "Stile National Geographic (gratuito).", implemented: false, category: "Artistico" },
  { id: "stamen_toner", label: "Stamen Toner", description: "Stile bianco/nero ad alto contrasto.", implemented: false, category: "Artistico" },
  { id: "stamen_watercolor", label: "Stamen Watercolor", description: "Stile acquerello artistico.", implemented: false, category: "Artistico" },
  { id: "stamen_terrain", label: "Stamen Terrain", description: "Stile terrain con rilievo.", implemented: false, category: "Artistico" },
  { id: "stadia_alidade_smooth", label: "Stadia Alidade Smooth", description: "Base smooth moderna (freemium).", implemented: false, category: "Artistico" },
  { id: "openweathermap_overlay", label: "OpenWeatherMap Overlay", description: "Overlay meteo (precipitazioni, vento). Solo overlay, non base.", implemented: false, category: "Overlay" },
];

export const ROUTING_OPTIONS: ReadonlyArray<MapsOption<RoutingEngineId>> = [
  { id: "graphhopper", label: "GraphHopper (classico)", description: "Engine routing attuale self-hosted. Default produzione.", implemented: true },
  { id: "valhalla", label: "Valhalla (self-hosted)", description: "Engine alternativo self-hosted con profili moto avanzati.", implemented: true },
  { id: "mapbox", label: "Mapbox Directions (cloud emergency)", description: "Cloud Mapbox Directions — backup emergenza quando self-hosted down. 100k req/mese free. Profilo 'driving' (no motorcycle nativo; exclude autostrade/traghetti per approssimare moto). Richiede MAPBOX_ACCESS_TOKEN (sk.*).", implemented: true },
  { id: "tomtom", label: "TomTom Routing", description: "Cloud TomTom — profilo moto + traffico EU real-time.", implemented: false },
];

export const ROUTING_PROFILE_OPTIONS: ReadonlyArray<MapsOption<RoutingProfileId>> = [
  { id: "moto-curvy", label: "Moto Curvy", description: "Privilegia curve, strade panoramiche, evita autostrade.", implemented: true },
  { id: "fast", label: "Fast", description: "Percorso più rapido, autostrade incluse.", implemented: true },
  { id: "scenic", label: "Scenic", description: "Massimizza paesaggio e punti panoramici.", implemented: false },
  { id: "off-road", label: "Off-Road", description: "Include sterrate e strade bianche (enduro).", implemented: false },
];

export interface MapsConfig {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  tile: MapsTileId;
  routing: RoutingEngineId;
  profile: RoutingProfileId;
  renderer_notes: string;
  routing_notes: string;
}

export const DEFAULT_MAPS_CONFIG: MapsConfig = {
  rollout: "disabled",
  renderer: "leaflet",
  tile: "carto_light",
  routing: "graphhopper",
  profile: "moto-curvy",
  renderer_notes: "",
  routing_notes: "",
};

export function isValidRollout(v: unknown): v is MapsRollout {
  return typeof v === "string" && (ROLLOUT_VALUES as ReadonlyArray<string>).includes(v);
}
export function isValidRenderer(v: unknown): v is MapsRendererId {
  return typeof v === "string" && RENDERER_OPTIONS.some((o) => o.id === v);
}
export function isValidTile(v: unknown): v is MapsTileId {
  return typeof v === "string" && TILE_OPTIONS.some((o) => o.id === v);
}
export function isValidRouting(v: unknown): v is RoutingEngineId {
  return typeof v === "string" && ROUTING_OPTIONS.some((o) => o.id === v);
}
export function isValidProfile(v: unknown): v is RoutingProfileId {
  return typeof v === "string" && ROUTING_PROFILE_OPTIONS.some((o) => o.id === v);
}
