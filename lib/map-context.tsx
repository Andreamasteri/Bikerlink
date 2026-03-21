import React, { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MapProvider } from "@/lib/map-tiles";

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
  const { data, isLoading } = useQuery<MapsApiResponse>({
    queryKey: ["/api/settings/maps"],
    staleTime: 120000,
    retry: false,
  });

  const value: MapConfig = {
    enabled: data?.enabled !== false,
    provider: (data?.provider ?? "carto_light") as MapProvider,
    isLoading,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapConfig(): MapConfig {
  return useContext(MapContext);
}
