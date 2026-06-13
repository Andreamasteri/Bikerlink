import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import type { MapsRollout, MapsRendererId, RoutingEngineId } from "@shared/maps-config";
import type { TileCategory } from "./tile-providers";
import { findTileProvider } from "./tile-providers";

interface MapsRolloutSettings {
  rollout: MapsRollout;
  renderer: MapsRendererId;
  engine: RoutingEngineId;
  testerCanCustomize?: boolean;
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

export const TESTER_RENDERER_KEY = "user_map_renderer";
export const TESTER_TILE_KEY = "user_map_tile";

const VALID_RENDERERS: MapsRendererId[] = ["leaflet", "maplibre", "openlayers", "maplibre-full-3d"];

export function useMapsRollout(): MapsRolloutResult {
  const { user } = useAuth();
  const [testerRenderer, setTesterRenderer] = useState<MapsRendererId | null>(null);
  const [testerTileId, setTesterTileId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await AsyncStorage.getMany([TESTER_RENDERER_KEY, TESTER_TILE_KEY]);
        if (!active) return;
        const rv = result[TESTER_RENDERER_KEY];
        setTesterRenderer(rv && VALID_RENDERERS.includes(rv as MapsRendererId) ? (rv as MapsRendererId) : null);
        setTesterTileId(result[TESTER_TILE_KEY] ?? null);
      } catch {
        // AsyncStorage non disponibile: ignora le preferenze tester
      }
    })();
    return () => { active = false; };
  }, []);

  const { data: rolloutData } = useQuery<MapsRolloutSettings>({
    queryKey: ["/api/settings/maps-rollout"],
    staleTime: 60_000,
  });

  const tilePlatform = Platform.OS === "web" ? "web" : "mobile";
  const { data: tileData } = useQuery<TileProvidersSettings>({
    queryKey: [`/api/settings/tile-providers?platform=${tilePlatform}`],
    staleTime: 60_000,
  });

  const rollout = rolloutData?.rollout ?? "disabled";
  const renderer = rolloutData?.renderer ?? "leaflet";
  const engine = rolloutData?.engine ?? "graphhopper";
  const testerCanCustomize = rolloutData?.testerCanCustomize ?? false;
  const isMapTester = (user as { mapTester?: boolean } | null)?.mapTester ?? false;
  const activeTile = tileData?.active ?? DEFAULT_TILE;

  if (rollout === "disabled") {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper", activeTile };
  }

  if (rollout === "tester" && !isMapTester) {
    return { enabled: false, renderer: "leaflet", engine: "graphhopper", activeTile };
  }

  // Override personalizzazione tester (solo se rollout=tester, tester e admin lo consente)
  const canCustomize = rollout === "tester" && isMapTester && testerCanCustomize;
  if (canCustomize) {
    const customRenderer = testerRenderer ?? renderer;
    let customTile = activeTile;
    if (testerTileId) {
      const provider = findTileProvider(testerTileId);
      // Reject archived providers and platform-incompatible providers.
      // If the stored testerTileId is invalid for this client, fall back to
      // the server-resolved activeTile so no archived/incompatible tile is loaded.
      const clientPlatform = Platform.OS === "web" ? "web" : "mobile";
      const isPlatformCompatible =
        provider &&
        !provider.archived &&
        (provider.platform === "both" || provider.platform === clientPlatform);
      if (isPlatformCompatible) {
        customTile = {
          id: provider.id,
          urlTemplate: provider.urlTemplate,
          maxZoom: provider.maxZoom,
          category: provider.category,
        };
      }
    }
    return { enabled: true, renderer: customRenderer, engine, activeTile: customTile };
  }

  return { enabled: true, renderer, engine, activeTile };
}
