/**
 * tile-fallback.ts — selects the best available tile provider with fallback logic.
 *
 * getActiveTileProviderWithFallback() takes a preloaded status map so it can
 * live in lib/ without importing server-only code.
 *
 * Usage (server-side):
 *   const statuses = await loadProviderStatuses();
 *   const result = getActiveTileProviderWithFallback(activeId, "leaflet", statuses);
 */

import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID } from "./tile-providers";
import { resolveTileUrl, type ResolvedTile } from "./tile-for-renderer";

export type ProviderStatusValue = "active" | "quota_exceeded" | "unreachable";

export interface FallbackResult extends ResolvedTile {
  isFallback: boolean;
  originalId: string;
}

/**
 * Returns the first active, compatible tile provider for the given renderer.
 * Skips providers whose status is quota_exceeded or unreachable.
 * Falls back to the default provider if everything else is unavailable.
 *
 * @param activeId    — the configured active provider id
 * @param renderer    — "leaflet" or "maplibre"
 * @param statuses    — map of providerId → status (defaults all to "active")
 */
export function getActiveTileProviderWithFallback(
  activeId: string,
  renderer: "leaflet" | "maplibre" = "leaflet",
  statuses: Record<string, ProviderStatusValue> = {},
): FallbackResult {
  const compatible = TILE_PROVIDERS.filter((p) => p.rendererCompat.includes(renderer));

  const sorted = [
    ...compatible.filter((p) => p.id === activeId),
    ...compatible.filter((p) => p.id !== activeId),
  ];

  for (const provider of sorted) {
    const status = statuses[provider.id] ?? "active";
    if (status === "active") {
      return {
        id: provider.id,
        urlTemplate: resolveTileUrl(provider),
        maxZoom: provider.maxZoom,
        isFallback: provider.id !== activeId,
        originalId: activeId,
      };
    }
  }

  const last =
    TILE_PROVIDERS.find((p) => p.id === DEFAULT_TILE_PROVIDER_ID) ?? TILE_PROVIDERS[0];
  return {
    id: last.id,
    urlTemplate: resolveTileUrl(last),
    maxZoom: last.maxZoom,
    isFallback: true,
    originalId: activeId,
  };
}
