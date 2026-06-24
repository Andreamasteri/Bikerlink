import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { queryClient, apiRequest, getApiUrl } from "@/lib/query-client";
import type { ClubMapPin } from "@/components/InteractiveMap";
import type { AdCampaign } from "@/shared/db/ads";

type Coords = { latitude: number; longitude: number };

type Props = {
  location: Coords | null;
  isAuthenticated: boolean;
  mapReady: boolean;
  countriesLoaded: boolean;
  countriesQueryParam: string;
  motoTags?: string[];
  showOnlineList: boolean;
  showBikerList: boolean;
  showZavorrinaList: boolean;
  showOfflineOnline: boolean;
  selectedUserId: string | undefined;
  mapFullscreen: boolean;
  sosEnabled: boolean | undefined;
  setShowSosDetail: (v: boolean) => void;
  setSelectedEgg: (v: null) => void;
  t: (key: string) => string;
  filterVessels?: boolean;
  aisEnabled?: boolean;
  mapBbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
};

export function useMapData({
  location,
  isAuthenticated,
  mapReady,
  countriesLoaded,
  countriesQueryParam,
  motoTags,
  showOnlineList,
  showBikerList,
  showZavorrinaList,
  showOfflineOnline,
  selectedUserId,
  mapFullscreen,
  sosEnabled,
  setShowSosDetail,
  setSelectedEgg,
  t,
}: Props) {
  const router = useRouter();
  const baseUrl = getApiUrl();

  // Task #2697 — la mappa usa la selezione area (modal Paesi/continente/mondo)
  // come unico filtro spaziale, non un raggio "vicino a me". Inviamo quindi
  // sempre `radius=world` così il backend non taglia gli utenti fuori dai 50km.
  const radiusParam = "world";
  // Task #2721 — chiave normalizzata (ordinata + dedup) per cache stabile.
  const motoTagsKey = (motoTags && motoTags.length > 0)
    ? Array.from(new Set(motoTags)).sort().join(",")
    : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nearbyUsersQuery = useQuery<any[]>({
    queryKey: ["/api/users/nearby", location?.latitude, location?.longitude, countriesQueryParam, radiusParam, motoTagsKey],
    queryFn: async () => {
      if (!location) return [];
      const url = new URL("/api/users/nearby", baseUrl);
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lng", String(location.longitude));
      url.searchParams.set("radius", radiusParam);
      if (countriesQueryParam) url.searchParams.set("countries", countriesQueryParam);
      if (motoTagsKey) url.searchParams.set("motoTags", motoTagsKey);
      const res = await apiRequest("GET", url.pathname + url.search);
      return res.json();
    },
    retry: false,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && !!location && mapReady && countriesLoaded,
  });

  const nearbyLoaded = nearbyUsersQuery.isFetched || nearbyUsersQuery.isError;

  const onlineCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/online-count", countriesQueryParam],
    queryFn: () => apiRequest("GET", `/api/users/online-count${countriesQueryParam ? `?countries=${countriesQueryParam}` : ""}`).then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && mapReady && countriesLoaded,
  });

  const bikerCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/biker-available-count", countriesQueryParam],
    queryFn: () => apiRequest("GET", `/api/users/biker-available-count${countriesQueryParam ? `?countries=${countriesQueryParam}` : ""}`).then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && mapReady && countriesLoaded,
  });

  const zavCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/zavorrine-available-count", countriesQueryParam],
    queryFn: () => apiRequest("GET", `/api/users/zavorrine-available-count${countriesQueryParam ? `?countries=${countriesQueryParam}` : ""}`).then(r => r.json()),
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && mapReady && countriesLoaded,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workshopsQuery = useQuery<any[]>({
    queryKey: ["/api/workshops"],
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessesQuery = useQuery<any[]>({
    queryKey: ["/api/businesses"],
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const easterEggsQuery = useQuery<any[]>({
    queryKey: ["/api/easter-eggs/nearby", location?.latitude, location?.longitude],
    queryFn: async () => {
      if (!location) return [];
      const res = await apiRequest("GET", `/api/easter-eggs/nearby?lat=${location.latitude}&lng=${location.longitude}`);
      return res.json();
    },
    retry: false,
    staleTime: 60000,
    refetchInterval: 60000,
    enabled: isAuthenticated && !!location && nearbyLoaded,
  });

  const { data: adsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
    staleTime: 30000,
    enabled: isAuthenticated,
  });
  const adsGloballyEnabled = adsEnabledData?.enabled !== false;

  const myAdsQuery = useQuery<AdCampaign[]>({
    queryKey: ["/api/ads/my-ads"],
    staleTime: 60000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isAuthenticated && adsGloballyEnabled,
  });

  const homeMessageQuery = useQuery<{ enabled: boolean; text: string }>({
    queryKey: ["/api/settings/home-message"],
    staleTime: 0,
    refetchInterval: 60000,
    enabled: isAuthenticated,
  });

  const profileQuery = useQuery({
    queryKey: ["/api/users/profile"],
    enabled: isAuthenticated,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onlineListQuery = useQuery<any[]>({
    queryKey: ["/api/users/online-list", location?.latitude, location?.longitude, showOfflineOnline, countriesQueryParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (location) { params.set("lat", String(location.latitude)); params.set("lng", String(location.longitude)); }
      if (showOfflineOnline) params.set("includeOffline", "true");
      if (countriesQueryParam) params.set("countries", countriesQueryParam);
      const qs = params.toString();
      return apiRequest("GET", `/api/users/online-list${qs ? `?${qs}` : ""}`).then(r => r.json());
    },
    staleTime: 15000,
    enabled: isAuthenticated && showOnlineList,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bikerListQuery = useQuery<any[]>({
    queryKey: ["/api/users/biker-available-list", location?.latitude, location?.longitude, countriesQueryParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (location) { params.set("lat", String(location.latitude)); params.set("lng", String(location.longitude)); }
      if (countriesQueryParam) params.set("countries", countriesQueryParam);
      const qs = params.toString();
      return apiRequest("GET", `/api/users/biker-available-list${qs ? `?${qs}` : ""}`).then(r => r.json());
    },
    staleTime: 15000,
    enabled: isAuthenticated && showBikerList,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zavListQuery = useQuery<any[]>({
    queryKey: ["/api/users/zavorrine-available-list", location?.latitude, location?.longitude, countriesQueryParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (location) { params.set("lat", String(location.latitude)); params.set("lng", String(location.longitude)); }
      if (countriesQueryParam) params.set("countries", countriesQueryParam);
      const qs = params.toString();
      return apiRequest("GET", `/api/users/zavorrine-available-list${qs ? `?${qs}` : ""}`).then(r => r.json());
    },
    staleTime: 15000,
    enabled: isAuthenticated && showZavorrinaList,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSosQuery = useQuery<any[]>({
    queryKey: ["/api/sos/active"],
    staleTime: 15000,
    refetchInterval: 15000,
    enabled: isAuthenticated && !!sosEnabled && nearbyLoaded,
  });

  const acceptSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/accept`);
      return res.json();
    },
    onSuccess: (d: { conversationId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosDetail(false);
      if (d.conversationId) router.push(`/chat/${d.conversationId}` as never);
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myProposalsQuery = useQuery<any[]>({
    queryKey: ["/api/proposals?status=active"],
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (d: any) => Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []),
  });

  const clubPinsQuery = useQuery<ClubMapPin[]>({
    queryKey: ["/api/motoclubs/map"],
    staleTime: 120000,
    enabled: isAuthenticated && mapFullscreen,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myOrganizedEventsQuery = useQuery<any[]>({
    queryKey: ["/api/events/my"],
    enabled: isAuthenticated,
    staleTime: 60000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (data: any[]) => {
      const todayStr = new Date().toISOString().substring(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).filter((ev: any) => ev.status === "approved" && (ev.eventDate ?? "").substring(0, 10) >= todayStr);
    },
  });

  const targetUserEventIdsQuery = useQuery<string[]>({
    queryKey: ["/api/events/user-events", selectedUserId],
    enabled: !!selectedUserId,
    staleTime: 30000,
  });

  const collectEggMutation = useMutation({
    mutationFn: async (eggId: string) => {
      const res = await apiRequest("POST", `/api/easter-eggs/${eggId}/collect`);
      return res.json();
    },
    onSuccess: (data: { prizeUnlocked?: boolean; message?: string }) => {
      if (data.prizeUnlocked) {
        Alert.alert(t("home.easterEggPrize"), data.message || t("home.easterEgg10Msg"));
      } else {
        Alert.alert(t("home.easterEggTitle"), data.message || t("home.easterEggCongrats"));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
      setSelectedEgg(null);
    },
    onError: (err: Error) => {
      Alert.alert(t("common.error"), err.message || t("home.cannotCollect"));
    },
  });

  const invalidateCountryQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
  }, []);

  return {
    nearbyUsersQuery,
    nearbyLoaded,
    onlineCountQuery,
    bikerCountQuery,
    zavCountQuery,
    workshopsQuery,
    businessesQuery,
    easterEggsQuery,
    adsGloballyEnabled,
    myAdsQuery,
    homeMessageQuery,
    profileQuery,
    onlineListQuery,
    bikerListQuery,
    zavListQuery,
    activeSosQuery,
    acceptSosMutation,
    myProposalsQuery,
    clubPinsQuery,
    myOrganizedEventsQuery,
    targetUserEventIdsQuery,
    collectEggMutation,
    invalidateCountryQueries,
  };
}
