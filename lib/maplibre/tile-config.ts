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
