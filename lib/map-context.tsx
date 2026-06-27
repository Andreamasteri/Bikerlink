import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { MapProvider } from "@/lib/map-tiles";
import { getTileConfig } from "@/lib/map-tiles";

const VALID_PROVIDERS: MapProvider[] = ["carto_light", "carto_dark", "esri_gray"];
const CARTO_VARIANTS = new Set(["carto-light", "carto-dark"]);

const CARTO_LIGHT_URL = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
const CARTO_DARK_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

interface MapConfig {
  enabled: boolean;
  adminProvider: MapProvider;
  resolvedProvider: MapProvider;
  activeTileUrl: string;
  activeTileMaxZoom: number;
  isLoading: boolean;
}

interface MapsApiResponse {
  enabled: boolean;
  provider: string;
}

interface UserProfileResponse {
  profile?: {
    preferredMapStyle?: string | null;
  } | null;
}

interface ActiveTileInfo {
  id: string;
  urlTemplate: string;
  maxZoom: number;
}

interface TileProvidersResponse {
  activeId: string;
  active: ActiveTileInfo;
}

const defaultConfig: MapConfig = {
  enabled: true,
  adminProvider: "carto_light",
  resolvedProvider: "carto_light",
  activeTileUrl: CARTO_LIGHT_URL,
  activeTileMaxZoom: 19,
  isLoading: false,
};

const MapContext = createContext<MapConfig>(defaultConfig);

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data: mapsData, isLoading: mapsLoading } = useQuery<MapsApiResponse>({
    queryKey: ["/api/settings/maps"],
    staleTime: 120000,
    retry: false,
    enabled: !!user,
  });

  const { data: profileData, isLoading: profileLoading } = useQuery<UserProfileResponse>({
    queryKey: ["/api/users/me"],
    staleTime: 60000,
    retry: false,
    enabled: !!user,
  });

  const tilePlatform = Platform.OS === "web" ? "web" : "mobile";
  const { data: tileData, isLoading: tileLoading } = useQuery<TileProvidersResponse>({
    queryKey: [`/api/settings/tile-providers?platform=${tilePlatform}`],
    staleTime: 120000,
    retry: false,
    enabled: !!user,
  });

  const rawAdminProvider = mapsData?.provider as MapProvider | undefined;
  const adminProvider: MapProvider =
    rawAdminProvider && VALID_PROVIDERS.includes(rawAdminProvider)
      ? rawAdminProvider
      : "carto_light";

  const mapsEnabled = mapsData?.enabled !== false;

  const rawUserPref = profileData?.profile?.preferredMapStyle as MapProvider | undefined;
  const userPref: MapProvider | undefined =
    rawUserPref && VALID_PROVIDERS.includes(rawUserPref) ? rawUserPref : undefined;

  const isCartoVariant = (p: MapProvider) => p === "carto_light" || p === "carto_dark";

  let resolvedProvider: MapProvider;
  if (!mapsEnabled) {
    resolvedProvider = adminProvider;
  } else if (isCartoVariant(adminProvider) && userPref && isCartoVariant(userPref)) {
    resolvedProvider = userPref;
  } else {
    resolvedProvider = adminProvider;
  }

  const activeTile = tileData?.active;
  let activeTileUrl: string;
  let activeTileMaxZoom: number;

  if (!activeTile) {
    const fallback = getTileConfig(resolvedProvider);
    activeTileUrl = fallback.urlTemplate;
    activeTileMaxZoom = fallback.maximumZ;
  } else if (CARTO_VARIANTS.has(activeTile.id)) {
    activeTileUrl = resolvedProvider === "carto_dark" ? CARTO_DARK_URL : CARTO_LIGHT_URL;
    activeTileMaxZoom = 19;
  } else {
    activeTileUrl = activeTile.urlTemplate;
    activeTileMaxZoom = activeTile.maxZoom;
  }

  const value = useMemo<MapConfig>(
    () => ({
      enabled: mapsEnabled,
      adminProvider,
      resolvedProvider,
      activeTileUrl,
      activeTileMaxZoom,
      isLoading: mapsLoading || profileLoading || tileLoading,
    }),
    [
      mapsEnabled,
      adminProvider,
      resolvedProvider,
      activeTileUrl,
      activeTileMaxZoom,
      mapsLoading,
      profileLoading,
      tileLoading,
    ],
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapConfig(): MapConfig {
  return useContext(MapContext);
}
