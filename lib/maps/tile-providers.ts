export type TileCategory = "base" | "topo" | "satellite" | "overlay";
export type TileCost = "free" | "api-key";

export interface TileProvider {
  id: string;
  label: string;
  description: string;
  category: TileCategory;
  urlTemplate: string;
  apiKeyEnvVar?: string;
  maxZoom: number;
  cost: TileCost;
  rendererCompat: Array<"leaflet" | "maplibre" | "openlayers">;
}

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: "carto-light",
    label: "Carto Light",
    description: "Mappa stradale pulita, ideale per navigazione diurna",
    category: "base",
    urlTemplate: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "carto-dark",
    label: "Carto Dark",
    description: "Tema scuro, ottimo per guida notturna o schermi AMOLED",
    category: "base",
    urlTemplate: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "carto-voyager",
    label: "Carto Voyager",
    description: "Stile colorato con POI, bilanciato per uso generale",
    category: "base",
    urlTemplate: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "esri-gray",
    label: "Esri Gray",
    description: "Sfondo neutro grigio, ideale per overlay dati",
    category: "base",
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 16,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "esri-topo",
    label: "Esri Topo",
    description: "Mappa topografica dettagliata con rilievi e quote",
    category: "topo",
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 18,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "esri-worldimagery",
    label: "Esri World Imagery",
    description: "Satellite ad alta risoluzione, ottimo per orientamento",
    category: "satellite",
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "opentopomap",
    label: "OpenTopoMap",
    description: "Curve di livello OSM, perfetto per strade di montagna",
    category: "topo",
    urlTemplate: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "stadia-smooth",
    label: "Stadia Alidade Smooth",
    description: "Design minimale e leggibile, zoom fino a 20",
    category: "base",
    urlTemplate: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png",
    maxZoom: 20,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "stadia-dark",
    label: "Stadia Alidade Dark",
    description: "Versione scura di Stadia, contrasto elevato di notte",
    category: "base",
    urlTemplate: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
    maxZoom: 20,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "stadia-osm-bright",
    label: "Stadia OSM Bright",
    description: "Stile OSM brillante con colori vivaci e alta leggibilità",
    category: "base",
    urlTemplate: "https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png",
    maxZoom: 20,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "maptiler-streets",
    label: "MapTiler Streets",
    description: "Strade dettagliate con etichette multilingua, zoom 20",
    category: "base",
    urlTemplate: "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={apiKey}",
    apiKeyEnvVar: "MAPTILER_API_KEY",
    maxZoom: 20,
    cost: "api-key",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "maptiler-outdoor",
    label: "MapTiler Outdoor",
    description: "Topo premium con sentieri, piste e attività outdoor",
    category: "topo",
    urlTemplate: "https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key={apiKey}",
    apiKeyEnvVar: "MAPTILER_API_KEY",
    maxZoom: 20,
    cost: "api-key",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "usgs-topo",
    label: "USGS Topo",
    description: "Topografica ufficiale USA, zoom limitato a 16",
    category: "topo",
    urlTemplate: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 16,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "thunderforest-cycle",
    label: "Thunderforest Cycle",
    description: "Piste ciclabili evidenziate, utile per percorsi misti",
    category: "topo",
    urlTemplate: "https://a.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apiKey}",
    apiKeyEnvVar: "THUNDERFOREST_API_KEY",
    maxZoom: 18,
    cost: "api-key",
    rendererCompat: ["leaflet"],
  },
  {
    id: "openrailwaymap",
    label: "OpenRailwayMap",
    description: "Overlay ferroviario OSM, da sovrapporre a mappa base",
    category: "overlay",
    urlTemplate: "https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "openseamap",
    label: "OpenSeaMap",
    description: "Segnaletica nautica, da sovrapporre a mappa base",
    category: "overlay",
    urlTemplate: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
    maxZoom: 18,
    cost: "free",
    rendererCompat: ["leaflet"],
  },
  {
    id: "osm-standard",
    label: "OSM Standard",
    description: "Mappa OpenStreetMap classica, aggiornata dalla community",
    category: "base",
    urlTemplate: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    cost: "free",
    rendererCompat: ["leaflet", "maplibre", "openlayers"],
  },
  {
    id: "owm-clouds",
    label: "OWM Nuvole",
    description: "Copertura nuvolosa in tempo reale, da sovrapporre",
    category: "overlay",
    urlTemplate: "https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid={apiKey}",
    apiKeyEnvVar: "OPENWEATHERMAP_API_KEY",
    maxZoom: 18,
    cost: "api-key",
    rendererCompat: ["leaflet"],
  },
];

export const DEFAULT_TILE_PROVIDER_ID = "carto-light";

export function findTileProvider(id: string): TileProvider | undefined {
  return TILE_PROVIDERS.find((p) => p.id === id);
}
