import React, { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { MapProvider } from "@/lib/map-tiles";

const VALID_PROVIDERS: MapProvider[] = ["carto_light", "carto_dark", "osm"];

interface MapConfig {
  enabled: boolean;
  provider: MapProvider;
  isLoading: boolean;
}

interface MapsApiResponse {
  enabled: boolean;
  provider: string;
}

const defaultConfig: MapConfig = {
  enabled: true,
  provider: "carto_light",
  isLoading: false,
};

const MapContext = createContext<MapConfig>(defaultConfig);

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<MapsApiResponse>({
    queryKey: ["/api/settings/maps"],
    staleTime: 120000,
    retry: false,
    enabled: !!user,
  });

  const rawProvider = data?.provider as MapProvider | undefined;
  const provider: MapProvider =
    rawProvider && VALID_PROVIDERS.includes(rawProvider) ? rawProvider : "carto_light";

  const value: MapConfig = {
    enabled: data?.enabled !== false,
    provider,
    isLoading,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapConfig(): MapConfig {
  return useContext(MapContext);
}
