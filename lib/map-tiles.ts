import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "./maps/tile-providers";

export type MapProvider = "carto_light" | "carto_dark" | "esri_gray";

export interface TileConfig {
  urlTemplate: string;
  maximumZ: number;
  shouldReplaceMapContent: boolean;
}

export const SELF_HOSTED_TILES_URL: string | undefined =
  (typeof process !== "undefined" ? process.env?.TILES_URL : undefined) ??
  (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_TILES_URL : undefined);

export const isTilesSelfHosted: boolean = Boolean(SELF_HOSTED_TILES_URL);

const LEGACY_TILE_CONFIGS: Record<MapProvider, TileConfig> = {
  carto_light: {
    urlTemplate: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    maximumZ: 19,
    shouldReplaceMapContent: true,
  },
  carto_dark: {
    urlTemplate: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    maximumZ: 19,
    shouldReplaceMapContent: true,
  },
  esri_gray: {
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    maximumZ: 16,
    shouldReplaceMapContent: true,
  },
};

export const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  esri_gray: "Mappa Base",
  carto_light: "Mappa Dettagliata Light & Dark",
  carto_dark: "Detailed Map",
};

export const MAP_PROVIDER_DESCRIPTIONS: Record<MapProvider, string> = {
  esri_gray: "Utile se hai poco segnale o preferisci il minimalismo.",
  carto_light: "Mappa dettagliata con modalità chiara e scura. Cambia tema con il toggle sulla mappa.",
  carto_dark: "Mappa dettagliata, modalità notte.",
};

export function getTileConfig(provider: MapProvider): TileConfig {
  return LEGACY_TILE_CONFIGS[provider];
}

export function getTileConfigById(id: string): TileConfig {
  const provider = findTileProvider(id) ?? findTileProvider(DEFAULT_TILE_PROVIDER_ID)!;
  return {
    urlTemplate: provider.urlTemplate,
    maximumZ: provider.maxZoom,
    shouldReplaceMapContent: true,
  };
}

export { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider };
