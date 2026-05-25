import { useMapsRollout } from "./useMapsRollout";
import type { MapsRendererId } from "@shared/maps-config";

export interface RendererSelectorResult {
  renderer: MapsRendererId;
  isMapLibreMinimal: boolean;
  canUseExperimental: boolean;
  isLoading: boolean;
}

/**
 * Central renderer selector hook for Sistema Mappe (Task #2311 + #2312).
 *
 * Returns the effective renderer ID and convenience flags.
 * Non-tester users always resolve to "leaflet" regardless of the admin selection.
 */
export function useRendererSelector(): RendererSelectorResult {
  const { effectiveRenderer, canUseExperimental, isLoading } = useMapsRollout();

  return {
    renderer: effectiveRenderer,
    isMapLibreMinimal: effectiveRenderer === "maplibre_minimal",
    canUseExperimental,
    isLoading,
  };
}
