import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { queryClient, apiRequest, getApiUrl } from "@/lib/query-client";
import type { ClubMapPin } from "@/components/InteractiveMap";

type Coords = { latitude: number; longitude: number };

type Props = {
  location: Coords | null;
  isAuthenticated: boolean;
  mapReady: boolean;
  countriesLoaded: boolean;
  countriesQueryParam: string;
  showOnlineList: boolean;
  showBikerList: boolean;
  showZavorrinaList: boolean;
  showOfflineOnline: boolean;
  selectedUserId: string | undefined;
  mapFullscreen: boolean;
  sosEnabled: boolean | undefined;
  setShowSosDetail: (v: boolean) => void;
  setSelectedEgg: (v: any) => void;
  t: (key: string) => string;
};

export function useMapData({
  location,
  isAuthenticated,
  mapReady,
  countriesLoaded,
  countriesQueryParam,
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

  const nearbyUsersQuery = useQuery<any[]>({
    queryKey: ["/api/users/nearby", location?.latitude, location?.longitude, countriesQueryParam],
    queryFn: async () => {
      if (!location) return [];
      const url = new URL("/api/users/nearby", baseUrl);
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lng", String(location.longitude));
      if (countriesQueryParam) url.searchParams.set("countries", countriesQueryParam);
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

  const workshopsQuery = useQuery<any[]>({
    queryKey: ["/api/workshops"],
    retry: false,
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
  });

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
    enabled: isAuthenticated && mapReady,
  });
  const adsGloballyEnabled = adsEnabledData?.enabled !== false;

  const myAdsQuery = useQuery<any[]>({
    queryKey: ["/api/ads/my-ads"],
    staleTime: 60000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isAuthenticated && adsGloballyEnabled && mapReady,
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
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosDetail(false);
      if (d.conversationId) router.push(`/chat/${d.conversationId}` as any);
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  const myProposalsQuery = useQuery<any[]>({
    queryKey: ["/api/proposals?status=active"],
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
  });

  const clubPinsQuery = useQuery<ClubMapPin[]>({
    queryKey: ["/api/motoclubs/map"],
    staleTime: 120000,
    enabled: isAuthenticated && mapFullscreen,
  });

  const myOrganizedEventsQuery = useQuery<any[]>({
    queryKey: ["/api/events/my"],
    enabled: isAuthenticated,
    staleTime: 60000,
    select: (data: any[]) => {
      const todayStr = new Date().toISOString().substring(0, 10);
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
    onSuccess: (data: any) => {
      if (data.prizeUnlocked) {
        Alert.alert(t("home.easterEggPrize"), data.message || t("home.easterEgg10Msg"));
      } else {
        Alert.alert(t("home.easterEggTitle"), data.message || t("home.easterEggCongrats"));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
      setSelectedEgg(null);
    },
    onError: (err: any) => {
      Alert.alert(t("common.error"), (err as Error).message || t("home.cannotCollect"));
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
