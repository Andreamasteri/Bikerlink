import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Modal,
  Alert,
  Linking,
  Image,
  TextInput,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getApiUrl } from "@/lib/query-client";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useSynecoVisible } from "@/lib/syneco-context";
import { useSetting } from "@/lib/settings-context";
import InteractiveMap from "@/components/InteractiveMap";
import { getRegionCoordinates } from "@/constants/regions";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";

export default function MapScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const baseUrl = getApiUrl();
  const synecoVisible = useSynecoVisible();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [filterBiker, setFilterBiker] = useState(true);
  const [filterZavorrina, setFilterZavorrina] = useState(true);
  const [filterCoppia, setFilterCoppia] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedUserProposals, setSelectedUserProposals] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEgg, setSelectedEgg] = useState<any>(null);
  const [showOnlineList, setShowOnlineList] = useState(false);
  const [showBikerList, setShowBikerList] = useState(false);
  const [showZavorrinaList, setShowZavorrinaList] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const [adImageError, setAdImageError] = useState<string | null>(null);
  const [showOfflineOnline, setShowOfflineOnline] = useState(false);
  const [showSosDetail, setShowSosDetail] = useState(false);
  const [offlineCountdown, setOfflineCountdown] = useState<{ online: number }>({ online: 0 });
  const sosEnabled = useSetting("sosEnabled");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome");
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (mapReady) return;
    const t = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(t);
  }, [mapReady]);

  const getRegionFallback = useCallback(() => {
    if (user?.region) {
      return getRegionCoordinates(user.region, user?.country);
    }
    return { latitude: 41.9028, longitude: 12.4964 };
  }, [user?.region, user?.country]);

  const fetchGPSLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      let coords: { latitude: number; longitude: number } | null = null;

      if (Platform.OS === "web") {
        coords = await new Promise((resolve) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve(null),
              { timeout: 5000 }
            );
          } else {
            resolve(null);
          }
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return null;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      }

      if (coords) {
        try {
          await apiRequest("PUT", "/api/users/location", {
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
        } catch (e) {}
      }
      return coords;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const gps = await fetchGPSLocation();
      if (gps) {
        setLocation(gps);
      } else {
        setLocation(getRegionFallback());
      }
      setLocationLoading(false);
    })();
  }, [fetchGPSLocation, getRegionFallback]);

  const handleCenterPosition = useCallback(async () => {
    const gps = await fetchGPSLocation();
    if (gps) {
      setLocation(gps);
    } else {
      setLocation(getRegionFallback());
    }
  }, [fetchGPSLocation, getRegionFallback]);

  const startOfflineTimer = useCallback(() => {
    setOfflineCountdown({ online: 30 });
  }, []);

  const hasActiveCountdown = offlineCountdown.online > 0;

  useEffect(() => {
    if (!hasActiveCountdown) return;
    const interval = setInterval(() => {
      setOfflineCountdown((prev) => {
        const next = { ...prev };
        if (next.online > 0) {
          next.online -= 1;
          if (next.online === 0) setShowOfflineOnline(false);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasActiveCountdown]);

  // --- LIVELLO 2: si attivano dopo che la mappa è pronta ---
  const nearbyUsersQuery = useQuery<any[]>({
    queryKey: ["/api/users/nearby", location?.latitude, location?.longitude],
    queryFn: async () => {
      if (!location) return [];
      const url = new URL("/api/users/nearby", baseUrl);
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lng", String(location.longitude));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
    staleTime: 300000,
    refetchInterval: 300000,
    enabled: isAuthenticated && !!location && mapReady,
  });

  const nearbyLoaded = nearbyUsersQuery.isFetched || nearbyUsersQuery.isError;

  // --- LIVELLO 2: contatori (dopo mappa pronta, refresh 5 minuti) ---
  const onlineCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/online-count"],
    staleTime: 300000,
    refetchInterval: 300000,
    enabled: isAuthenticated && mapReady,
  });

  const bikerCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/biker-available-count"],
    staleTime: 300000,
    refetchInterval: 300000,
    enabled: isAuthenticated && mapReady,
  });

  const zavCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/users/zavorrine-available-count"],
    staleTime: 300000,
    refetchInterval: 300000,
    enabled: isAuthenticated && mapReady,
  });

  // --- LIVELLO 3: dati secondari (dopo utenti vicini caricati) ---
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
      const url = new URL("/api/easter-eggs/nearby", getApiUrl());
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lng", String(location.longitude));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
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
    enabled: isAuthenticated && nearbyLoaded,
  });
  const adsGloballyEnabled = adsEnabledData?.enabled !== false;

  const myAdsQuery = useQuery<any[]>({
    queryKey: ["/api/ads/my-ads"],
    staleTime: 60000,
    enabled: isAuthenticated && adsGloballyEnabled && nearbyLoaded,
  });

  const profileQuery = useQuery({
    queryKey: ["/api/users/profile"],
    enabled: isAuthenticated,
  });
  const isAvailable = (profileQuery.data as any)?.isAvailable || false;

  const onlineListQuery = useQuery<any[]>({
    queryKey: ["/api/users/online-list", location?.latitude, location?.longitude, showOfflineOnline],
    queryFn: async () => {
      const url = new URL("/api/users/online-list", getApiUrl());
      if (location) {
        url.searchParams.set("lat", String(location.latitude));
        url.searchParams.set("lng", String(location.longitude));
      }
      if (showOfflineOnline) url.searchParams.set("includeOffline", "true");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15000,
    enabled: isAuthenticated && showOnlineList,
  });

  const bikerListQuery = useQuery<any[]>({
    queryKey: ["/api/users/biker-available-list", location?.latitude, location?.longitude],
    queryFn: async () => {
      const url = new URL("/api/users/biker-available-list", getApiUrl());
      if (location) {
        url.searchParams.set("lat", String(location.latitude));
        url.searchParams.set("lng", String(location.longitude));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15000,
    enabled: isAuthenticated && showBikerList,
  });

  const zavListQuery = useQuery<any[]>({
    queryKey: ["/api/users/zavorrine-available-list", location?.latitude, location?.longitude],
    queryFn: async () => {
      const url = new URL("/api/users/zavorrine-available-list", getApiUrl());
      if (location) {
        url.searchParams.set("lat", String(location.latitude));
        url.searchParams.set("lng", String(location.longitude));
      }
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15000,
    enabled: isAuthenticated && showZavorrinaList,
  });

  const activeSosQuery = useQuery<any[]>({
    queryKey: ["/api/sos/active"],
    staleTime: 15000,
    refetchInterval: 15000,
    enabled: isAuthenticated && sosEnabled && nearbyLoaded,
  });

  const acceptSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/accept`);
      return res.json();
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosDetail(false);
      if (d.conversationId) {
        router.push(`/chat/${d.conversationId}` as any);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message);
    },
  });

  const myProposalsQuery = useQuery<any[]>({
    queryKey: ["/api/proposals?status=active"],
    staleTime: 60000,
    enabled: isAuthenticated && nearbyLoaded,
  });
  const mySearchRadius = useMemo(() => {
    const myActive = (myProposalsQuery.data || []).filter(
      (p: any) => p.userId === user?.id && p.status === "active" && p.searchRadius
    );
    if (myActive.length === 0) return 0;
    return Math.max(...myActive.map((p: any) => p.searchRadius || 0));
  }, [myProposalsQuery.data, user?.id]);

  const autoCollectingRef = React.useRef<Set<string>>(new Set());

  const collectEggMutation = useMutation({
    mutationFn: async (eggId: string) => {
      const res = await apiRequest("POST", `/api/easter-eggs/${eggId}/collect`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.prizeUnlocked) {
        Alert.alert("Premio Sbloccato!", data.message || "Hai raccolto 10 Easter Egg!");
      } else {
        Alert.alert("Easter Egg!", data.message || "Complimenti! Hai raccolto un premio! Continua così!");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
      setSelectedEgg(null);
    },
    onError: (err: any) => {
      Alert.alert("Errore", err.message || "Impossibile raccogliere");
    },
  });

  useEffect(() => {
    const nearbyEggs = easterEggsQuery.data || [];
    const uncollected = nearbyEggs.filter((e: any) => !e.collected && !autoCollectingRef.current.has(e.id));
    if (uncollected.length > 0) {
      uncollected.forEach((egg: any) => {
        autoCollectingRef.current.add(egg.id);
        apiRequest("POST", `/api/easter-eggs/${egg.id}/collect`)
          .then((res) => res.json())
          .then((data: any) => {
            if (data.prizeUnlocked) {
              Alert.alert("Premio Sbloccato!", data.message || "Hai raccolto 10 Easter Egg!");
            } else {
              Alert.alert("Easter Egg!", data.message || "Complimenti! Hai raccolto un premio! Continua così!");
            }
            queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
          })
          .catch(() => {})
          .finally(() => {
            autoCollectingRef.current.delete(egg.id);
          });
      });
    }
  }, [easterEggsQuery.data]);

  const handleUserPress = useCallback(async (mapUser: any) => {
    setSelectedUser(mapUser);
    setDetailLoading(true);
    setSelectedUserDetail(null);
    setSelectedUserProposals([]);
    try {
      const [detailRes, proposalsRes] = await Promise.all([
        fetch(new URL(`/api/users/${mapUser.id}/public`, baseUrl).toString(), { credentials: "include" }),
        fetch(new URL("/api/proposals", baseUrl).toString(), { credentials: "include" }),
      ]);
      if (detailRes.ok) {
        setSelectedUserDetail(await detailRes.json());
      }
      if (proposalsRes.ok) {
        const allProposals = await proposalsRes.json();
        const userProposals = (Array.isArray(allProposals) ? allProposals : []).filter(
          (p: any) => p.userId === mapUser.id && p.status === "active"
        );
        setSelectedUserProposals(userProposals);
      }
    } catch (e) {}
    setDetailLoading(false);
  }, []);

  const handleEasterEggPress = useCallback((egg: any) => {
    setSelectedEgg(egg);
  }, []);

  const nearbyUsers = (nearbyUsersQuery.data as any) || [];
  const workshops = (workshopsQuery.data as any) || [];
  const myAds = myAdsQuery.data || [];
  const onlineCount = onlineCountQuery.data?.count ?? 0;
  const bikerCount = bikerCountQuery.data?.count ?? 0;
  const zavCount = zavCountQuery.data?.count ?? 0;

  useEffect(() => {
    if (myAds.length <= 1) return;
    const firstAd = myAds[0] as any;
    const duration = (firstAd?.rotationDuration || 10) * 1000;
    const mode = firstAd?.rotationMode || "sequential";
    const timer = setInterval(() => {
      setAdIndex((prev) => {
        if (mode === "random") return Math.floor(Math.random() * myAds.length);
        return (prev + 1) % myAds.length;
      });
    }, duration);
    return () => clearInterval(timer);
  }, [myAds]);

  const handleAdClick = useCallback(async (ad: any) => {
    try {
      await apiRequest("POST", `/api/ads/${ad.id}/click`);
    } catch (e) {}
    if (ad.linkUrl) {
      let url = ad.linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }
      try {
        await Linking.openURL(url);
      } catch (e) {}
    }
  }, []);

  const handleSearch = useCallback(async (text: string) => {
    setSearchText(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const url = new URL("/api/users/search", baseUrl);
      url.searchParams.set("q", text.trim());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.filter((u: any) => u.id !== user?.id));
      }
    } catch { }
    setSearchLoading(false);
  }, [baseUrl, user?.id]);

  const handleSearchResultPress = useCallback((u: any) => {
    setShowSearchResults(false);
    setSearchText("");
    setSearchResults([]);
    handleUserPress(u);
  }, []);

  if (authLoading || locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento mappa...</Text>
      </View>
    );
  }

  const getUserColor = (u: any) => {
    if (u.userType === "coppia") return Colors.accent;
    if (u.sex === "F") return Colors.femaleIcon;
    if (u.sex === "M") return Colors.maleIcon;
    if (u.userType?.startsWith("zavorrina")) return Colors.femaleIcon;
    if (u.userType?.startsWith("biker")) return Colors.maleIcon;
    return Colors.accent;
  };

  const getUserTypeLabel = (u: any) => {
    if (u.userType?.startsWith("biker")) return "Biker";
    if (u.userType?.startsWith("zavorrina")) return "Zavorrina/o";
    return "Coppia";
  };

  const getUserIcon = (u: any): keyof typeof Ionicons.glyphMap => {
    if (u.userType === "coppia") return "people";
    if (u.userType?.startsWith("zavorrina")) return "person";
    return "bicycle";
  };

  const nearbyUsersList = Array.isArray(nearbyUsers) ? nearbyUsers : [];
  const workshopsList = Array.isArray(workshops) ? workshops : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: Platform.OS === "web" ? 67 : insets.top, paddingBottom: 16 }}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>BikerLink</Text>
          <Image source={require("@/assets/images/helmet-logo.png")} style={styles.helmetLogo} resizeMode="contain" />
        </View>
        <Pressable onPress={() => router.push("/chat" as any)}>
          <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputRow}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca per nickname o email..."
            placeholderTextColor={Colors.textSecondary}
            value={searchText}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(""); setSearchResults([]); setShowSearchResults(false); }}>
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {showSearchResults && (
          <View style={styles.searchResultsContainer}>
            {searchLoading ? (
              <ActivityIndicator size="small" color={Colors.accent} style={{ padding: 12 }} />
            ) : searchResults.length === 0 ? (
              <Text style={styles.searchNoResults}>Nessun risultato</Text>
            ) : (
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {searchResults.map((u: any) => (
                  <TouchableOpacity key={u.id} style={styles.searchResultItem} onPress={() => handleSearchResultPress(u)}>
                    <Ionicons name={getUserIcon(u)} size={22} color={getUserColor(u)} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchResultName}>{u.nickname}</Text>
                      <Text style={styles.searchResultDetail}>{getUserTypeLabel(u)}{u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}{u.region ? ` · ${u.region}` : ""}{!u.latitude ? " · Posizione non disponibile" : ""}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      <Pressable style={styles.mapContainer} onPress={() => setMapFullscreen(true)}>
        <InteractiveMap
          users={(nearbyUsersQuery.data ?? []).filter((u: any) => u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude))}
          workshops={(workshopsQuery.data ?? []).filter((w: any) => w.latitude != null && w.longitude != null && !isNaN(w.latitude) && !isNaN(w.longitude))}
          easterEggs={(easterEggsQuery.data ?? []).filter((e: any) => e.latitude != null && e.longitude != null && !isNaN(e.latitude) && !isNaN(e.longitude))}
          activeSosRequests={(activeSosQuery.data ?? []).filter((s: any) => s.latitude != null && s.longitude != null)}
          isAvailable={isAvailable}
          searchRadiusKm={mySearchRadius}
          filterBiker={filterBiker}
          filterZavorrina={filterZavorrina}
          filterCoppia={filterCoppia}
          onToggleFilterBiker={() => setFilterBiker((p) => !p)}
          onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
          onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
          onUserPress={handleUserPress}
          onEasterEggPress={handleEasterEggPress}
          onReady={() => setMapReady(true)}
        />
        <View style={styles.expandHint}>
          <Ionicons name="expand" size={16} color={Colors.text} />
        </View>
      </Pressable>

      <Modal visible={mapFullscreen} animationType="fade" onRequestClose={() => setMapFullscreen(false)}>
        <View style={styles.fullscreenContainer}>
          <InteractiveMap
            users={(nearbyUsersQuery.data ?? []).filter((u: any) => u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude))}
            workshops={(workshopsQuery.data ?? []).filter((w: any) => w.latitude != null && w.longitude != null && !isNaN(w.latitude) && !isNaN(w.longitude))}
            easterEggs={(easterEggsQuery.data ?? []).filter((e: any) => e.latitude != null && e.longitude != null && !isNaN(e.latitude) && !isNaN(e.longitude))}
            activeSosRequests={(activeSosQuery.data ?? []).filter((s: any) => s.latitude != null && s.longitude != null)}
            isAvailable={isAvailable}
            searchRadiusKm={mySearchRadius}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            filterCoppia={filterCoppia}
            filterBarTopOffset={Platform.OS === "web" ? 67 : insets.top}
            onToggleFilterBiker={() => setFilterBiker((p) => !p)}
            onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
            onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
            onUserPress={handleUserPress}
            onEasterEggPress={handleEasterEggPress}
          />
          <Pressable style={[styles.closeBtn, { top: Platform.OS === "web" ? 12 : insets.top + 4 }]} onPress={() => setMapFullscreen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View style={[styles.fullscreenBottomStats, { bottom: Platform.OS === "web" ? 44 : 24 }]}>
            <View style={styles.statsChip}>
              <MaterialCommunityIcons name="motorbike" size={14} color={Colors.maleIcon} />
              <Text style={styles.statsChipText}>{bikerCount}</Text>
            </View>
            <View style={styles.statsChip}>
              <MaterialCommunityIcons name="seat-passenger" size={14} color={Colors.femaleIcon} />
              <Text style={styles.statsChipText}>{zavCount}</Text>
            </View>
            <View style={styles.statsChip}>
              <Ionicons name="radio-button-on" size={12} color={Colors.success} />
              <Text style={styles.statsChipText}>{onlineCount}</Text>
            </View>
          </View>
          <View style={[styles.fullscreenSearchContainer, { top: Platform.OS === "web" ? 48 : insets.top + 40 }]}>
            <View style={styles.fullscreenSearchRow}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca per nickname o email..."
                placeholderTextColor={Colors.textSecondary}
                value={searchText}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchText(""); setSearchResults([]); setShowSearchResults(false); }}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {showSearchResults && (
              <View style={styles.searchResultsContainer}>
                {searchLoading ? (
                  <ActivityIndicator size="small" color={Colors.accent} style={{ padding: 12 }} />
                ) : searchResults.length === 0 ? (
                  <Text style={styles.searchNoResults}>Nessun risultato</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                    {searchResults.map((u: any) => (
                      <TouchableOpacity key={u.id} style={styles.searchResultItem} onPress={() => { setMapFullscreen(false); handleSearchResultPress(u); }}>
                        <Ionicons name={getUserIcon(u)} size={22} color={getUserColor(u)} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultName}>{u.nickname}</Text>
                          <Text style={styles.searchResultDetail}>{getUserTypeLabel(u)}{u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}{u.region ? ` · ${u.region}` : ""}{!u.latitude ? " · Posizione non disponibile" : ""}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => setShowOnlineList(true)}>
          <View style={styles.statTopRow}>
            <Ionicons name="radio-button-on" size={18} color={Colors.success} />
            <Text style={styles.statNumber}>{onlineCount}</Text>
          </View>
          <Text style={styles.statLabel}>{"Utenti\nOnline"}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setShowBikerList(true)}>
          <View style={styles.statTopRow}>
            <Ionicons name="hand-left" size={18} color={Colors.accent} />
            <Text style={styles.statNumber}>{bikerCount}</Text>
          </View>
          <Text style={styles.statLabel}>{"Biker\nDisponibili"}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setShowZavorrinaList(true)}>
          <View style={styles.statTopRow}>
            <MaterialCommunityIcons name="seat-passenger" size={18} color={Colors.femaleIcon} />
            <Text style={styles.statNumber}>{zavCount}</Text>
          </View>
          <Text style={styles.statLabel}>{"Zavorrine\nDisponibili"}</Text>
        </Pressable>
      </View>



      <Modal visible={showOnlineList} transparent animationType="slide" onRequestClose={() => setShowOnlineList(false)}>
        <Pressable style={styles.detailOverlay} onPress={() => setShowOnlineList(false)}>
          <Pressable style={styles.listSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            <View style={styles.listSheetHeader}>
              <Ionicons name="radio-button-on" size={20} color={Colors.success} />
              <Text style={styles.listSheetTitle}>Utenti Online</Text>
              <Pressable onPress={() => setShowOnlineList(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              style={[styles.offlineToggle, showOfflineOnline && styles.offlineToggleActive]}
              onPress={() => {
                const next = !showOfflineOnline;
                setShowOfflineOnline(next);
                if (next) {
                  startOfflineTimer();
                  queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
                } else {
                  setOfflineCountdown({ online: 0 });
                }
              }}
            >
              <Ionicons name={showOfflineOnline ? "eye" : "eye-off"} size={16} color={showOfflineOnline ? Colors.accent : Colors.textSecondary} />
              <Text style={[styles.offlineToggleText, showOfflineOnline && { color: Colors.accent }]}>
                {showOfflineOnline ? `Anche offline (${offlineCountdown.online}s)` : "Mostra anche offline"}
              </Text>
            </Pressable>
            {onlineListQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (onlineListQuery.data || []).length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={32} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>Nessun utente online</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
                {(onlineListQuery.data || []).map((u: any) => (
                  <Pressable key={u.id} style={[styles.userListCard, u.isOnline === false && showOfflineOnline && { opacity: 0.5 }]} onPress={() => { setShowOnlineList(false); router.push(`/profile/${u.id}` as any); }}>
                    <View style={styles.userListLeft}>
                      <Ionicons name={getUserIcon(u)} size={28} color={getUserColor(u)} />
                      {u.isAvailable ? <View style={styles.availableDot} /> : showOfflineOnline ? <View style={[styles.availableDot, { backgroundColor: "#666" }]} /> : null}
                    </View>
                    <View style={styles.userListInfo}>
                      <Text style={styles.userListName}>{u.nickname}</Text>
                      <Text style={styles.userListDetail}>{getUserTypeLabel(u)}{u.sex ? ` · ${u.sex === "M" ? "M" : "F"}` : ""}{u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}{u.region ? ` · ${u.region}` : ""}</Text>
                      {!!u.moto && <Text style={styles.userListDetail}>{u.moto}{u.ridingStyle ? ` · ${u.ridingStyle}` : ""}</Text>}
                      {!!u.bio && <Text style={styles.userListBio} numberOfLines={1}>{u.bio}</Text>}
                      {!!u.birthYear && <Text style={styles.userListDetail}>Anno: {u.birthYear}</Text>}
                    </View>
                    {u.distance != null && (
                      <View style={styles.userListDistance}>
                        <Text style={styles.distanceText}>{u.distance} km</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showBikerList} transparent animationType="slide" onRequestClose={() => setShowBikerList(false)}>
        <Pressable style={styles.detailOverlay} onPress={() => setShowBikerList(false)}>
          <Pressable style={styles.listSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            <View style={styles.listSheetHeader}>
              <Ionicons name="hand-left" size={20} color={Colors.accent} />
              <Text style={styles.listSheetTitle}>Biker Disponibili</Text>
              <Pressable onPress={() => setShowBikerList(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {bikerListQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (bikerListQuery.data || []).length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="bicycle" size={32} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>Nessun biker disponibile</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
                {(bikerListQuery.data || []).map((u: any) => (
                  <Pressable key={u.id} style={styles.userListCard} onPress={() => { setShowBikerList(false); router.push(`/profile/${u.id}` as any); }}>
                    <View style={styles.userListLeft}>
                      <Ionicons name={getUserIcon(u)} size={28} color={getUserColor(u)} />
                      {u.isAvailable ? <View style={styles.availableDot} /> : null}
                    </View>
                    <View style={styles.userListInfo}>
                      <Text style={styles.userListName}>{u.nickname}</Text>
                      <Text style={styles.userListDetail}>{getUserTypeLabel(u)}{u.sex ? ` · ${u.sex === "M" ? "M" : "F"}` : ""}{u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}{u.region ? ` · ${u.region}` : ""}</Text>
                      {!!u.moto && <Text style={styles.userListDetail}>{u.moto}{u.ridingStyle ? ` · ${u.ridingStyle}` : ""}</Text>}
                      {!!u.bio && <Text style={styles.userListBio} numberOfLines={1}>{u.bio}</Text>}
                      {!!u.birthYear && <Text style={styles.userListDetail}>Anno: {u.birthYear}</Text>}
                    </View>
                    {u.distance != null && (
                      <View style={styles.userListDistance}>
                        <Text style={styles.distanceText}>{u.distance} km</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showZavorrinaList} transparent animationType="slide" onRequestClose={() => setShowZavorrinaList(false)}>
        <Pressable style={styles.detailOverlay} onPress={() => setShowZavorrinaList(false)}>
          <Pressable style={styles.listSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            <View style={styles.listSheetHeader}>
              <MaterialCommunityIcons name="seat-passenger" size={20} color={Colors.femaleIcon} />
              <Text style={styles.listSheetTitle}>Zavorrine Disponibili</Text>
              <Pressable onPress={() => setShowZavorrinaList(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {zavListQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.femaleIcon} style={{ marginVertical: 40 }} />
            ) : (zavListQuery.data || []).length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="seat-passenger" size={32} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>Nessuna zavorrina disponibile</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
                {(zavListQuery.data || []).map((u: any) => (
                  <Pressable key={u.id} style={styles.userListCard} onPress={() => { setShowZavorrinaList(false); router.push(`/profile/${u.id}` as any); }}>
                    <View style={styles.userListLeft}>
                      <Ionicons name={getUserIcon(u)} size={28} color={getUserColor(u)} />
                      {u.isAvailable ? <View style={styles.availableDot} /> : null}
                    </View>
                    <View style={styles.userListInfo}>
                      <Text style={styles.userListName}>{u.nickname}</Text>
                      <Text style={styles.userListDetail}>{getUserTypeLabel(u)}{u.sex ? ` · ${u.sex === "M" ? "M" : "F"}` : ""}{u.country ? ` · ${getCountryFlag(u.country)} ${getCountryName(u.country)}` : ""}{u.region ? ` · ${u.region}` : ""}</Text>
                      {!!u.bio && <Text style={styles.userListBio} numberOfLines={1}>{u.bio}</Text>}
                      {!!u.birthYear && <Text style={styles.userListDetail}>Anno: {u.birthYear}</Text>}
                    </View>
                    {u.distance != null && (
                      <View style={styles.userListDistance}>
                        <Text style={styles.distanceText}>{u.distance} km</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {adsGloballyEnabled && myAds.length > 0 && (
        <View style={styles.adWrapper}>
          <Pressable style={styles.adBanner} onPress={() => handleAdClick(myAds[adIndex % myAds.length])}>
            {(myAds[adIndex % myAds.length] as any)?.imageUrl && adImageError !== (myAds[adIndex % myAds.length] as any)?.id ? (
              <Image
                source={{ uri: `${getApiUrl()}${(myAds[adIndex % myAds.length] as any).imageUrl}` }}
                style={styles.adImage}
                resizeMode="cover"
                onError={() => setAdImageError((myAds[adIndex % myAds.length] as any)?.id)}
              />
            ) : (
              <View style={styles.adPlaceholder}>
                <Text style={styles.adText}>{(myAds[adIndex % myAds.length] as any)?.name}</Text>
                {(myAds[adIndex % myAds.length] as any)?.description && (
                  <Text style={styles.adSubText}>{(myAds[adIndex % myAds.length] as any).description}</Text>
                )}
              </View>
            )}
            {myAds.length > 1 && (
              <View style={styles.adDots}>
                {myAds.map((_: any, i: number) => (
                  <View key={i} style={[styles.adDot, i === adIndex % myAds.length && styles.adDotActive]} />
                ))}
              </View>
            )}
          </Pressable>
          {(activeSosQuery.data || []).length > 0 && (
            <Pressable style={styles.sosOverlay} onPress={() => setShowSosDetail(true)}>
              <View style={styles.sosWarningContainer}>
                <View style={styles.sosTriangleBorder} />
                <View style={styles.sosTriangleFill} />
                <Text style={styles.sosExclamation}>!</Text>
              </View>
              <Text style={styles.sosOverlayLabel}>SOS ATTIVO — Tocca per dettagli</Text>
            </Pressable>
          )}
        </View>
      )}

      <Modal visible={showSosDetail} transparent animationType="slide" onRequestClose={() => setShowSosDetail(false)}>
        <Pressable style={styles.detailOverlay} onPress={() => setShowSosDetail(false)}>
          <Pressable style={styles.sosDetailSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            <Pressable style={styles.sosDetailClose} onPress={() => setShowSosDetail(false)}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Image source={require("@/assets/images/sos-accept-icon.png")} style={styles.sosDetailIcon} resizeMode="contain" />
              <Text style={styles.sosDetailTitle}>Richiesta di Soccorso</Text>
            </View>
            {(activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {(activeSosQuery.data || []).filter((r: any) => r.requesterId !== user?.id).map((r: any) => (
                  <View key={r.id} style={styles.sosDetailCard}>
                    <View style={styles.sosDetailRow}>
                      <Ionicons name="person" size={18} color="#003399" />
                      <Text style={styles.sosDetailName}>{r.requesterNickname}</Text>
                    </View>
                    <View style={styles.sosDetailRow}>
                      <Ionicons name="alert-circle" size={18} color="#CC0000" />
                      <Text style={styles.sosDetailReason}>{r.reason}</Text>
                    </View>
                    <View style={styles.sosDetailRow}>
                      <Ionicons name="time" size={18} color={Colors.textSecondary} />
                      <Text style={styles.sosDetailTime}>
                        {new Date(r.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                        {r.radiusKm ? `  •  Raggio: ${r.radiusKm} km` : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.sosDetailAcceptBtn, acceptSosMutation.isPending && { opacity: 0.5 }]}
                      onPress={() => acceptSosMutation.mutate(r.id)}
                      disabled={acceptSosMutation.isPending}
                    >
                      {acceptSosMutation.isPending ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.sosDetailAcceptText}>Accetta richiesta di soccorso</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", padding: 24 }}>
                <Ionicons name="checkmark-circle-outline" size={40} color={Colors.textSecondary} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 8 }}>
                  Nessuna richiesta di soccorso disponibile
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelectedUser(null)}>
          <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            {detailLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                <View style={styles.detailHeader}>
                  <Ionicons
                    name={getUserIcon(selectedUser || {})}
                    size={32}
                    color={getUserColor(selectedUser || {})}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{selectedUser?.nickname}</Text>
                    <Text style={styles.detailType}>{getUserTypeLabel(selectedUser || {})}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedUser(null)}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </Pressable>
                </View>

                {selectedUserDetail?.bio && (
                  <Text style={styles.detailBio}>{selectedUserDetail.bio}</Text>
                )}

                {selectedUserDetail?.photos && selectedUserDetail.photos.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Foto</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {selectedUserDetail.photos.map((p: any) => {
                        const pUri = p.photoUrl?.startsWith("http") ? p.photoUrl : `${baseUrl}${p.photoUrl}`;
                        return (
                          <Image key={p.id} source={{ uri: pUri }} style={{ width: 80, height: 80, borderRadius: 10, marginRight: 8 }} />
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {selectedUserDetail?.motorcycles && selectedUserDetail.motorcycles.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Garage</Text>
                    {selectedUserDetail.motorcycles.map((m: any) => (
                      <View key={m.id} style={styles.detailMotoCard}>
                        <Ionicons name="bicycle" size={18} color={Colors.accent} />
                        <Text style={styles.detailMotoText}>
                          {m.brand} {m.model}
                          {m.motorcycleType ? ` · ${m.motorcycleType}` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Proposte Giri</Text>
                    {selectedUserProposals.map((p: any) => (
                      <Pressable
                        key={p.id}
                        style={styles.detailProposalCard}
                        onPress={() => { setSelectedUser(null); router.push(`/proposals/${p.id}` as any); }}
                      >
                        <Ionicons name="navigate" size={16} color={Colors.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailProposalTitle}>{p.title}</Text>
                          {p.location && <Text style={styles.detailProposalSub}>{p.location}</Text>}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                )}

                {selectedUserProposals.length === 0 && !detailLoading && (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <Text style={styles.detailType}>Nessuna proposta attiva</Text>
                  </View>
                )}

                <View style={styles.detailBtnRow}>
                  <Pressable
                    style={styles.detailChatBtn}
                    onPress={async () => {
                      try {
                        const res = await apiRequest("POST", "/api/chat/conversations", {
                          conversationType: "private",
                          participantIds: [selectedUser?.id],
                        });
                        const conv = await res.json();
                        setSelectedUser(null);
                        router.push(`/chat/${conv.id}` as any);
                      } catch (e: any) {
                        Alert.alert("Errore", e.message || "Impossibile aprire la chat");
                      }
                    }}
                  >
                    <Ionicons name="chatbubble" size={20} color={Colors.background} />
                    <Text style={styles.detailChatBtnText}>Messaggio</Text>
                  </Pressable>
                  <Pressable
                    style={styles.detailProfileBtn}
                    onPress={() => { setSelectedUser(null); router.push(`/profile/${selectedUser?.id}` as any); }}
                  >
                    <Text style={styles.detailProfileBtnText}>Vai al Profilo</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedEgg} transparent animationType="fade" onRequestClose={() => setSelectedEgg(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelectedEgg(null)}>
          <Pressable style={styles.eggSheet} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="gift" size={48} color="#FFD700" style={{ alignSelf: "center" }} />
            <Text style={styles.eggTitle}>{selectedEgg?.name}</Text>
            {selectedEgg?.description && (
              <Text style={styles.eggDescription}>{selectedEgg.description}</Text>
            )}
            {!!selectedEgg?.points && (
              <Text style={styles.eggPoints}>{selectedEgg.points} punti</Text>
            )}
            {selectedEgg?.collected ? (
              <View style={styles.eggCollectedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={[styles.eggPoints, { color: Colors.success }]}>Già raccolto</Text>
              </View>
            ) : (
              <Pressable
                style={styles.eggCollectBtn}
                onPress={() => selectedEgg && collectEggMutation.mutate(selectedEgg.id)}
                disabled={collectEggMutation.isPending}
              >
                {collectEggMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.eggCollectBtnText}>Raccogli!</Text>
                )}
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background },
  loadingText: { color: Colors.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.accent },
  helmetLogo: {
    width: 32,
    height: 32,
    tintColor: Colors.accent,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    zIndex: 10,
  },
  fullscreenSearchContainer: {
    position: "absolute" as const,
    left: 56,
    right: 56,
    zIndex: 20,
  },
  fullscreenSearchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(30,30,30,0.92)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  searchInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    padding: 0,
  },
  searchResultsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden" as const,
  },
  searchNoResults: {
    padding: 12,
    textAlign: "center" as const,
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  searchResultItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  searchResultName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  searchResultDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  mapContainer: {
    height: 280,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  expandHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: Colors.surface + "CC",
    borderRadius: 8,
    padding: 6,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  fullscreenOverlay: {
    position: "absolute",
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    zIndex: 20,
  },
  fullscreenBottomStats: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
  },
  statsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface + "E6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statsChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  statTopRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  statNumber: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.text },
  statLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center" as const, lineHeight: 12 },
  emptyState: { alignItems: "center", padding: 24, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  listSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  listSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  listSheetTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  userListCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  offlineToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  offlineToggleActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  offlineToggleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  userListLeft: { position: "relative" as const },
  availableDot: {
    position: "absolute" as const,
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  userListInfo: { flex: 1, gap: 2 },
  userListName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  userListDetail: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  userListBio: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic" as const },
  userListDistance: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  distanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  adWrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    position: "relative" as const,
  },
  adBanner: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  adImage: {
    width: "100%",
    height: 280,
    borderRadius: 12,
  },
  adPlaceholder: {
    backgroundColor: Colors.accent + "15",
    padding: 16,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  adText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  adSubText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  adDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  adDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textSecondary + "40",
  },
  adDotActive: {
    backgroundColor: Colors.accent,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  detailType: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailBio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
  detailSection: { marginBottom: 12 },
  detailSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent, marginBottom: 8 },
  detailMotoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  detailMotoText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  detailProposalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  detailProposalTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  detailProposalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  detailChatBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  detailChatBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.background },
  detailProfileBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailProfileBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  eggSheet: {
    backgroundColor: Colors.surface,
    marginHorizontal: 32,
    borderRadius: 20,
    padding: 24,
    alignSelf: "center",
    width: "85%",
    maxWidth: 340,
    position: "absolute",
    top: "30%",
  },
  eggTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginTop: 12 },
  eggDescription: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  eggPoints: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.accent, textAlign: "center", marginTop: 8 },
  eggCollectedBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  eggCollectBtn: {
    backgroundColor: "#FFD700",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  eggCollectBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.background },
  sosOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    zIndex: 10,
  },
  sosWarningContainer: {
    width: 100,
    height: 90,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sosTriangleBorder: {
    position: "absolute" as const,
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 52,
    borderRightWidth: 52,
    borderBottomWidth: 92,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  sosTriangleFill: {
    position: "absolute" as const,
    top: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 44,
    borderRightWidth: 44,
    borderBottomWidth: 78,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FF3300",
  },
  sosExclamation: {
    position: "absolute" as const,
    bottom: 6,
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  sosOverlayLabel: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  sosDetailSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  sosDetailClose: {
    position: "absolute" as const,
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  sosDetailIcon: {
    width: 80,
    height: 80,
    tintColor: "#003399",
    marginBottom: 8,
  },
  sosDetailTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#003399",
  },
  sosDetailCard: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#003399",
    gap: 10,
  },
  sosDetailRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  sosDetailName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  sosDetailReason: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#CC0000",
    flex: 1,
  },
  sosDetailTime: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  sosDetailAcceptBtn: {
    backgroundColor: "#003399",
    padding: 14,
    borderRadius: 12,
    alignItems: "center" as const,
    marginTop: 6,
  },
  sosDetailAcceptText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
