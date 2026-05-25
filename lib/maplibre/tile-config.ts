import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, findTileProvider } from "../maps/tile-providers";
import { getActiveTileProvider, type ResolvedTile } from "../maps/tile-for-renderer";

export type { ResolvedTile };

export function getMapLibreTileConfig(activeProviderId: string): ResolvedTile {
  return getActiveTileProvider(activeProviderId, "maplibre");
}

export function getMapLibreCompatProviders() {
  return TILE_PROVIDERS.filter((p) => p.rendererCompat.includes("maplibre"));
}

export function buildMapLibreStyle(tileUrl: string, maxZoom: number): object {
  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: maxZoom,
      },
    },
    layers: [
      {
        id: "simple-tiles",
        type: "raster",
        source: "raster-tiles",
      },
    ],
  };
}

export { findTileProvider, DEFAULT_TILE_PROVIDER_ID };

const MAPTILER_STYLE_URL = "https://api.maptiler.com/maps/streets-v2/style.json";
const FALLBACK_TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

export function getMapLibreStyleExpr(
  fallbackTileUrl: string = FALLBACK_TILE_URL
): string {
  const envTileUrl = process.env.MAPLIBRE_TILE_URL;
  const apiKey = process.env.MAPLIBRE_API_KEY;

  if (apiKey && apiKey.length > 4) {
    const styleUrl = envTileUrl ?? MAPTILER_STYLE_URL;
    const urlWithKey = styleUrl.includes("?")
      ? `${styleUrl}&key=${apiKey}`
      : `${styleUrl}?key=${apiKey}`;
    return JSON.stringify(urlWithKey);
  }

  const rasterUrl = envTileUrl ?? fallbackTileUrl;
  return JSON.stringify(buildMapLibreStyle(rasterUrl, 19));
}
