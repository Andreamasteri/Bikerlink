export type MapProvider = "carto_light" | "carto_dark" | "esri_gray";

export interface TileConfig {
  urlTemplate: string;
  maximumZ: number;
  shouldReplaceMapContent: boolean;
}

const TILE_CONFIGS: Record<MapProvider, TileConfig> = {
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
  esri_gray: "Base Map",
  carto_light: "FullMap Light",
  carto_dark: "FullMap",
};

export const MAP_PROVIDER_DESCRIPTIONS: Record<MapProvider, string> = {
  esri_gray: "Mappa base. Utile se hai poco segnale o preferisci il minimalismo.",
  carto_light: "Mappa dettagliata, chiara.",
  carto_dark: "Mappa dettagliata, modalità notte.",
};

export function getTileConfig(provider: MapProvider): TileConfig {
  return TILE_CONFIGS[provider];
}
