import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { MapsRollout, MapsRendererId, RoutingEngineId } from "@shared/maps-config";
import type { TileCategory } from "./tile-providers";

interface MapsRolloutSettings {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
}

interface ActiveTileProvider {
  id: string;
  urlTemplate: string;
  maxZoom: number;
  category?: TileCategory;
}

interface TileProvidersSettings {
  activeId: string;
  active: ActiveTileProvider;
}

interface MapsRolloutResult {
  enabled: boolean;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
  activeTile: ActiveTileProvider;
}

const DEFAULT_TILE: ActiveTileProvider = {
  id: "carto-light",
  urlTemplate: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  maxZoom: 19,
  category: "base",
};

export function useMapsRollout(): MapsRolloutResult {
  const { user } = useAuth();

  const { data: rolloutData } = useQuery<MapsRolloutSettings>({
    queryKey: ["/api/settings/maps-rollout"],
    staleTime: 60_000,
  });

  const { data: tileData } = useQuery<TileProvidersSettings>({
    queryKey: ["/api/settings/tile-providers"],
    staleTime: 60_000,
  });

  const rollout = rolloutData?.rollout ?? "disabled";
  const renderer = rolloutData?.renderer ?? "leaflet";
  const engine = rolloutData?.engine ?? "graphhopper";
  const isMapTester = (user as { mapTester?: boolean } | null)?.mapTester ?? false;
  const activeTile = tileData?.active ?? DEFAULT_TILE;

  if (rollout === "disabled") {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper", activeTile };
  }

  if (rollout === "tester" && !isMapTester) {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper", activeTile };
  }

  return { enabled: true, renderer, engine, activeTile };
}
