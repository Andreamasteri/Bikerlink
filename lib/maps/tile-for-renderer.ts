import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID, type TileProvider } from "./tile-providers";

export interface ResolvedTile {
  id: string;
  urlTemplate: string;
  maxZoom: number;
}

export function resolveTileUrl(provider: TileProvider): string {
  let url = provider.urlTemplate;
  if (provider.apiKeyEnvVar) {
    const key = process.env[provider.apiKeyEnvVar] ?? "";
    url = url.replace("{apiKey}", key);
  }
  return url;
}

export function getActiveTileProvider(
  activeId: string,
  renderer: "leaflet" | "maplibre" = "leaflet"
): ResolvedTile {
  const provider = TILE_PROVIDERS.find(
    (p) => p.id === activeId && p.rendererCompat.includes(renderer)
  );

  if (!provider) {
    const fallback = TILE_PROVIDERS.find(
      (p) => p.id === DEFAULT_TILE_PROVIDER_ID
    )!;
    return {
      id: fallback.id,
      urlTemplate: resolveTileUrl(fallback),
      maxZoom: fallback.maxZoom,
    };
  }

  return {
    id: provider.id,
    urlTemplate: resolveTileUrl(provider),
    maxZoom: provider.maxZoom,
  };
}

export function getPublicTileInfo(provider: TileProvider): { id: string; urlTemplate: string; maxZoom: number } {
  return { id: provider.id, urlTemplate: provider.urlTemplate, maxZoom: provider.maxZoom };
}
