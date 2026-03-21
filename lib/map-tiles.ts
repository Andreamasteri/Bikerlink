export type MapProvider = "carto_light" | "carto_dark" | "osm";

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
  osm: {
    urlTemplate: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maximumZ: 19,
    shouldReplaceMapContent: true,
  },
};

export function getTileConfig(provider: MapProvider): TileConfig {
  return TILE_CONFIGS[provider];
}
