import { useQuery } from "@tanstack/react-query";

export type MapProvider = "carto_light" | "carto_dark" | "osm";

interface SupportSettings {
  email: string;
  whatsapp: string;
}

export function useSupportSettings(): SupportSettings {
  const { data } = useQuery<SupportSettings>({
    queryKey: ["/api/settings/support"],
    staleTime: 60000,
    retry: false,
  });
  return {
    email: data?.email ?? "bikerlinkapp@gmail.com",
    whatsapp: data?.whatsapp ?? "",
  };
}

interface AppSettings {
  synecoBranding: boolean;
  emailVerification: boolean;
  chatbotEnabled: boolean;
  autoMatching: boolean;
  customRoutes: boolean;
  paypalEmail: string;
  sosEnabled: boolean;
  mapsEnabled: boolean;
  mapsProvider: MapProvider;
  unitsPrefEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  synecoBranding: false,
  emailVerification: false,
  chatbotEnabled: true,
  autoMatching: true,
  customRoutes: true,
  paypalEmail: "",
  sosEnabled: true,
  mapsEnabled: true,
  mapsProvider: "carto_light",
  unitsPrefEnabled: false,
};

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
    retry: false,
  });
}

export function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const { data } = useAppSettings();
  return data?.[key] ?? DEFAULT_SETTINGS[key];
}
