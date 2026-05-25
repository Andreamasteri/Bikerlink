import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { MapsRollout, MapsRendererId, RoutingEngineId } from "@shared/maps-config";

interface MapsRolloutSettings {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
}

interface MapsRolloutResult {
  enabled: boolean;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
}

export function useMapsRollout(): MapsRolloutResult {
  const { user } = useAuth();

  const { data } = useQuery<MapsRolloutSettings>({
    queryKey: ["/api/settings/maps-rollout"],
    staleTime: 60_000,
  });

  const rollout = data?.rollout ?? "disabled";
  const renderer = data?.renderer ?? "leaflet";
  const engine = data?.engine ?? "graphhopper";
  const isMapTester = (user as { mapTester?: boolean } | null)?.mapTester ?? false;

  if (rollout === "disabled") {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper" };
  }

  if (rollout === "tester" && !isMapTester) {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper" };
  }

  return { enabled: true, renderer, engine };
}
