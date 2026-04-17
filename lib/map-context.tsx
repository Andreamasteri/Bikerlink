import React, { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { MapProvider } from "@/lib/map-tiles";

const VALID_PROVIDERS: MapProvider[] = ["carto_light", "carto_dark", "esri_gray"];

interface MapConfig {
  enabled: boolean;
  adminProvider: MapProvider;
  resolvedProvider: MapProvider;
  userChoiceEnabled: boolean;
  useGoogleMaps: boolean;
  isLoading: boolean;
}

interface MapsApiResponse {
  enabled: boolean;
  provider: string;
  userChoiceEnabled: boolean;
  engine: string;
}

interface UserProfileResponse {
  profile?: {
    preferredMapStyle?: string | null;
  } | null;
}

const defaultConfig: MapConfig = {
  enabled: true,
  adminProvider: "carto_light",
  resolvedProvider: "carto_light",
  userChoiceEnabled: true,
  useGoogleMaps: false,
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

  const rawAdminProvider = mapsData?.provider as MapProvider | undefined;
  const adminProvider: MapProvider =
    rawAdminProvider && VALID_PROVIDERS.includes(rawAdminProvider)
      ? rawAdminProvider
      : "carto_light";

  const userChoiceEnabled = mapsData?.userChoiceEnabled !== false;
  const mapsEnabled = mapsData?.enabled !== false;
  const useGoogleMaps = mapsData?.engine === "google";

  const rawUserPref = profileData?.profile?.preferredMapStyle as MapProvider | undefined;
  const userPref: MapProvider | undefined =
    rawUserPref && VALID_PROVIDERS.includes(rawUserPref) ? rawUserPref : undefined;

  let resolvedProvider: MapProvider;
  if (!mapsEnabled) {
    resolvedProvider = adminProvider;
  } else if (userChoiceEnabled && userPref) {
    resolvedProvider = userPref;
  } else {
    resolvedProvider = adminProvider;
  }

  const value: MapConfig = {
    enabled: mapsEnabled,
    adminProvider,
    resolvedProvider,
    userChoiceEnabled,
    useGoogleMaps,
    isLoading: mapsLoading || profileLoading,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapConfig(): MapConfig {
  return useContext(MapContext);
}
