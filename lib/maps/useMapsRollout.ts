import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_MAPS_CONFIG,
  type MapsRollout,
  type MapsRendererId,
  type MapsTileId,
  type RoutingEngineId,
  type RoutingProfileId,
} from "@shared/maps-config";

export interface MapsRolloutSettings {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  tile: MapsTileId;
  routing: RoutingEngineId;
  profile: RoutingProfileId;
}

export interface MapsRolloutResult extends MapsRolloutSettings {
  /** Renderer that the current user is ACTUALLY allowed to load (always leaflet for non-testers). */
  effectiveRenderer: MapsRendererId;
  effectiveTile: MapsTileId;
  effectiveRouting: RoutingEngineId;
  effectiveProfile: RoutingProfileId;
  /** True when the user is allowed to access experimental renderers/routing. */
  canUseExperimental: boolean;
  /** True when the user is a designated map tester. */
  isMapTester: boolean;
  /** True when admin (always sees experimental). */
  isAdmin: boolean;
  isLoading: boolean;
}

/**
 * Three-state rollout gate for the Sistema Mappe foundation (Task #2311).
 *
 * Rollout semantics:
 *   - "disabled": only admins see experimental renderers/routing
 *   - "tester": admins + users with mapTester=true
 *   - "all": every authenticated user
 *
 * Non-eligible users ALWAYS resolve to leaflet + carto_light + graphhopper + moto-curvy
 * regardless of the admin selection. This guarantees lazy-imported experimental modules
 * are never even loaded for them.
 */
export function useMapsRollout(): MapsRolloutResult {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isMapTester = !!(user as { mapTester?: boolean } | null | undefined)?.mapTester;

  const { data, isLoading } = useQuery<MapsRolloutSettings>({
    queryKey: ["/api/settings/maps-rollout"],
    staleTime: 30_000,
  });

  const settings: MapsRolloutSettings = data ?? DEFAULT_MAPS_CONFIG;

  const canUseExperimental = useMemo(() => {
    if (isAdmin) return true;
    if (settings.rollout === "all") return true;
    if (settings.rollout === "tester") return isMapTester;
    return false;
  }, [isAdmin, isMapTester, settings.rollout]);

  const effectiveRenderer: MapsRendererId = canUseExperimental ? settings.renderer : DEFAULT_MAPS_CONFIG.renderer;
  const effectiveTile: MapsTileId = canUseExperimental ? settings.tile : DEFAULT_MAPS_CONFIG.tile;
  const effectiveRouting: RoutingEngineId = canUseExperimental ? settings.routing : DEFAULT_MAPS_CONFIG.routing;
  const effectiveProfile: RoutingProfileId = canUseExperimental ? settings.profile : DEFAULT_MAPS_CONFIG.profile;

  return {
    ...settings,
    effectiveRenderer,
    effectiveTile,
    effectiveRouting,
    effectiveProfile,
    canUseExperimental,
    isMapTester,
    isAdmin: !!isAdmin,
    isLoading,
  };
}
