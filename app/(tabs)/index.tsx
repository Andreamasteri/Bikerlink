import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Animated } from "react-native";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/query-client";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSynecoVisible } from "@/lib/syneco-context";
import { useSetting } from "@/lib/settings-context";
import { useLocationGate } from "@/lib/location-context";
import InteractiveMap, { type InteractiveMapHandle } from "@/components/InteractiveMap";
import { CONTINENT_MAP, getCountryByCode } from "@/lib/countries-regions";
import { useT } from "@/lib/language-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "react-native";
import { Alert } from "react-native";
import type { User } from "@shared/schema";
import { InlineMiniPlayer } from "@/components/MiniPlayer";

import { useMapFilters } from "@/hooks/useMapFilters";
import { useMapLocation } from "@/hooks/useMapLocation";
import { useMapData } from "@/hooks/useMapData";
import { getUserColor, getUserTypeLabel, getUserIcon } from "@/lib/mapUserUtils";
import MapSearchBar from "@/components/map/MapSearchBar";
import UserListSheet from "@/components/map/UserListSheet";
import UserDetailSheet from "@/components/map/UserDetailSheet";
import SosSheet from "@/components/map/SosSheet";
import AreaSelectorModal from "@/components/map/AreaSelectorModal";
import FullscreenMapModal from "@/components/map/FullscreenMapModal";
import AdBanner from "@/components/map/AdBanner";
import EasterEggSheet from "@/components/map/EasterEggSheet";
import PhotoLightbox from "@/components/map/PhotoLightbox";
import HomeMessageModal from "@/components/map/HomeMessageModal";
import styles from "@/components/map/mapScreenStyles";

type UserWithProfileCoords = Omit<User, "password"> & {
  profileLatitude?: number | null;
  profileLongitude?: number | null;
};

export default function MapScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const t = useT();
  const insets = useSafeAreaInsets();
  const synecoVisible = useSynecoVisible();
  const { positionReady: contextPositionReady, requestPermission, locationPermissionDenied, locationPermissionPrompt } = useLocationGate();

  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [mapFullscreenReady, setMapFullscreenReady] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [selectedMapPhoto, setSelectedMapPhoto] = useState<string | null>(null);
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
  const [showOfflineOnline, setShowOfflineOnline] = useState(false);
  const [showSosDetail, setShowSosDetail] = useState(false);
  const [offlineCountdown, setOfflineCountdown] = useState<{ online: number }>({ online: 0 });
  const sosEnabled = useSetting("sosEnabled");
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<InteractiveMapHandle>(null);
  const fullscreenMapRef = useRef<InteractiveMapHandle>(null);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [countriesLoaded, setCountriesLoaded] = useState(false);
  const [showHomeMessage, setShowHomeMessage] = useState(false);
  const [lastSmallMapCenter, setLastSmallMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingFocusCoords, setPendingFocusCoords] = useState<{ lat: number; lng: number; userId?: string; nickname?: string } | null>(null);
  const [focusToast, setFocusToast] = useState<string | null>(null);
  const focusToastAnim = useRef(new Animated.Value(0)).current;
  const [showLocationNudge, setShowLocationNudge] = useState(false);
  const locationNudgeCheckedRef = useRef(false);

  const {
    filterBiker,
    filterZavorrina,
    filterClubs,
    filterEvents,
    filtersLoaded,
    toggleFilterBiker,
    toggleFilterZavorrina,
    toggleFilterClubs,
    toggleFilterEvents,
  } = useMapFilters({ user, isAuthenticated });

  const typedUser = user as UserWithProfileCoords | null | undefined;

  const { location, locationLoading, webMobilePosition, webPhonePositionStatus, setLocation } = useMapLocation({
    userRegion: user?.region,
    userCountry: user?.country,
    profileLat: typedUser?.profileLatitude,
    profileLng: typedUser?.profileLongitude,
  });

  const countriesQueryParam = useMemo(() => {
    if (!countriesLoaded || selectedCountries.length === 0) return "";
    return selectedCountries.join(",");
  }, [selectedCountries, countriesLoaded]);

  const {
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
  } = useMapData({
    location,
    isAuthenticated,
    mapReady,
    countriesLoaded,
    countriesQueryParam,
    showOnlineList,
    showBikerList,
    showZavorrinaList,
    showOfflineOnline,
    selectedUserId: selectedUser?.id,
    mapFullscreen,
    sosEnabled,
    setShowSosDetail,
    setSelectedEgg,
    t,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/welcome");
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (mapReady) return;
    const timer = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(timer);
  }, [mapReady]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem("pending_focus_coords");
          if (!raw) return;
          await AsyncStorage.removeItem("pending_focus_coords");
          const parsed = JSON.parse(raw);
          const lat = parseFloat(parsed.lat);
          const lng = parseFloat(parsed.lng);
          if (isNaN(lat) || isNaN(lng)) return;
          setPendingFocusCoords({ lat, lng, userId: parsed.userId, nickname: parsed.nickname });
        } catch {}
      })();
    }, [])
  );

  useEffect(() => {
    if (!mapReady) return;
    if (!pendingFocusCoords) return;
    const { lat, lng, userId, nickname } = pendingFocusCoords;
    setPendingFocusCoords(null);
    const activeRef = mapFullscreen ? fullscreenMapRef : mapRef;
    activeRef.current?.focusOnCoordinate({ latitude: lat, longitude: lng, userId });
    if (nickname) {
      setFocusToast(`Vista centrata su ${nickname}`);
      Animated.sequence([
        Animated.timing(focusToastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(focusToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setFocusToast(null));
    }
  }, [mapReady, pendingFocusCoords, mapFullscreen, focusToastAnim]);

  useEffect(() => {
    if (mapFullscreen) {
      const timer = setTimeout(() => setMapFullscreenReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setMapFullscreenReady(false);
    }
  }, [mapFullscreen]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (locationNudgeCheckedRef.current) return;
    if (locationLoading) return;
    locationNudgeCheckedRef.current = true;
    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem("location_nudge_dismissed");
        if (dismissed === "1") return;
        if (!location && webPhonePositionStatus !== "live") {
          setShowLocationNudge(true);
        }
      } catch {}
    })();
  }, [locationLoading, location, webPhonePositionStatus]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("map_area_countries");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSelectedCountries(parsed);
            setCountriesLoaded(true);
            return;
          }
        }
      } catch {}
      setSelectedCountries(["IT"]);
      try { await AsyncStorage.setItem("map_area_countries", JSON.stringify(["IT"])); } catch {}
      setCountriesLoaded(true);
    })();
  }, []);

  const saveCountries = useCallback(async (countries: string[]) => {
    setSelectedCountries(countries);
    try { await AsyncStorage.setItem("map_area_countries", JSON.stringify(countries)); } catch {}
    invalidateCountryQueries();
  }, [invalidateCountryQueries]);

  const toggleCountryInModal = useCallback((code: string) => {
    if (code === "__world__") { setSelectedCountries([]); return; }
    setSelectedCountries((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }, []);

  const toggleContinentInModal = useCallback((continentKey: string) => {
    const continent = CONTINENT_MAP.find((c) => c.key === continentKey);
    if (!continent) return;
    const codes = continent.countryCodes;
    setSelectedCountries((prev) => {
      const allSelected = codes.every((code) => prev.includes(code));
      if (allSelected) return prev.filter((c) => !codes.includes(c));
      return [...prev, ...codes.filter((c) => !prev.includes(c))];
    });
  }, []);

  const areaLabel = useMemo(() => {
    if (selectedCountries.length === 0) return "🌍 Tutto il mondo";
    for (const continent of CONTINENT_MAP) {
      const allInContinent = continent.countryCodes.every((c) => selectedCountries.includes(c));
      const onlyContinent = selectedCountries.every((c) => continent.countryCodes.includes(c));
      if (allInContinent && onlyContinent && selectedCountries.length === continent.countryCodes.length) return `${continent.label}`;
    }
    if (selectedCountries.length === 1) {
      const country = getCountryByCode(selectedCountries[0]);
      return country ? `${country.flag} ${country.name}` : selectedCountries[0];
    }
    return `${selectedCountries.length} paesi`;
  }, [selectedCountries]);

  const startOfflineTimer = useCallback(() => { setOfflineCountdown({ online: 30 }); }, []);
  const hasActiveCountdown = offlineCountdown.online > 0;

  useEffect(() => {
    if (!hasActiveCountdown) return;
    const interval = setInterval(() => {
      setOfflineCountdown((prev) => {
        const next = { ...prev };
        if (next.online > 0) { next.online -= 1; if (next.online === 0) setShowOfflineOnline(false); }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasActiveCountdown]);

  const isAvailable = (profileQuery.data as any)?.isAvailable || false;
  const isGhostMode = (profileQuery.data as any)?.ghostMode || false;
  const fakeHomeEnabled = (profileQuery.data as any)?.fakeHomeEnabled || false;
  const fakeHomeLat = (profileQuery.data as any)?.fakeHomeLatitude ?? null;
  const fakeHomeLng = (profileQuery.data as any)?.fakeHomeLongitude ?? null;
  const realMeMarker = fakeHomeEnabled && fakeHomeLat != null && fakeHomeLng != null && location != null
    ? { latitude: location.latitude, longitude: location.longitude } : null;
  const fakeMeMarker = fakeHomeEnabled && fakeHomeLat != null && fakeHomeLng != null
    ? { latitude: Number(fakeHomeLat), longitude: Number(fakeHomeLng) } : null;

  const myAds = myAdsQuery.data || [];
  const onlineCount = onlineCountQuery.data?.count ?? 0;
  const bikerCount = bikerCountQuery.data?.count ?? 0;
  const zavCount = zavCountQuery.data?.count ?? 0;

  const nearbyUsers = (nearbyUsersQuery.data as any) || [];

  const usersWithSelf = useMemo(() => {
    const rawList: any[] = Array.isArray(nearbyUsers) ? nearbyUsers : [];
    if (!user || !location) return rawList;
    const alreadyPresent = rawList.some((u: any) => u.id === user.id);
    if (alreadyPresent) return rawList;
    return [{
      id: user.id, nickname: user.nickname ?? "",
      userType: (user.userType ?? "biker") as "biker" | "zavorrina" | "coppia",
      sex: user.sex ?? null, country: user.country ?? null, region: user.region ?? null,
      latitude: location.latitude, longitude: location.longitude,
    }, ...rawList];
  }, [nearbyUsers, user, location]);

  const smallMapInitialCenter = useMemo(() => {
    const filtersActive = !filterBiker || !filterZavorrina;
    if (filtersActive) {
      const visibleUsers = usersWithSelf.filter((u: any) => {
        if (u.latitude == null || u.longitude == null || isNaN(u.latitude) || isNaN(u.longitude)) return false;
        if (user?.id != null && u.id === user.id) return true;
        if (u.userType === "biker" && !filterBiker) return false;
        if (u.userType === "zavorrina" && !filterZavorrina) return false;
        return true;
      });
      if (visibleUsers.length > 0) {
        const lat = visibleUsers.reduce((s: number, u: any) => s + Number(u.latitude), 0) / visibleUsers.length;
        const lng = visibleUsers.reduce((s: number, u: any) => s + Number(u.longitude), 0) / visibleUsers.length;
        return { latitude: lat, longitude: lng };
      }
    }
    const profileData = profileQuery.data as any;
    const savedLat = profileData?.latitude;
    const savedLng = profileData?.longitude;
    if (savedLat != null && savedLng != null && !isNaN(Number(savedLat)) && !isNaN(Number(savedLng))) {
      return { latitude: Number(savedLat), longitude: Number(savedLng) };
    }
    return null;
  }, [filterBiker, filterZavorrina, usersWithSelf, user?.id, profileQuery.data]);

  const mySearchRadius = useMemo(() => {
    const myActive = (myProposalsQuery.data || []).filter(
      (p: any) => p.userId === user?.id && p.status === "active" && p.searchRadius
    );
    if (myActive.length === 0) return 0;
    return Math.max(...myActive.map((p: any) => p.searchRadius || 0));
  }, [myProposalsQuery.data, user?.id]);

  const autoCollectingRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const nearbyEggs = easterEggsQuery.data || [];
    const uncollected = nearbyEggs.filter((e: any) => !e.collected && !autoCollectingRef.current.has(e.id));
    if (uncollected.length > 0) {
      uncollected.forEach((egg: any) => {
        autoCollectingRef.current.add(egg.id);
        apiRequest("POST", `/api/easter-eggs/${egg.id}/collect`)
          .then((res) => res.json())
          .then((data: any) => {
            if (data.prizeUnlocked) Alert.alert(t("home.easterEggPrize"), data.message || t("home.easterEgg10Msg"));
            else Alert.alert(t("home.easterEggTitle"), data.message || t("home.easterEggCongrats"));
            queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
          })
          .catch(() => {})
          .finally(() => { autoCollectingRef.current.delete(egg.id); });
      });
    }
  }, [easterEggsQuery.data]);

  useEffect(() => {
    if (myAds.length <= 1) return;
    const firstAd = myAds[0] as any;
    const duration = (firstAd?.rotationDuration || 10) * 1000;
    const mode = firstAd?.rotationMode || "sequential";
    const timer = setInterval(() => {
      setAdIndex((prev) => mode === "random" ? Math.floor(Math.random() * myAds.length) : (prev + 1) % myAds.length);
    }, duration);
    return () => clearInterval(timer);
  }, [myAds]);

  const handleUserPress = useCallback(async (mapUser: any) => {
    setSelectedUser(mapUser);
    setDetailLoading(true);
    setSelectedUserDetail(null);
    setSelectedUserProposals([]);
    try {
      const [detailRes, proposalsRes] = await Promise.all([
        apiRequest("GET", `/api/users/${mapUser.id}/public`),
        apiRequest("GET", "/api/proposals"),
      ]);
      setSelectedUserDetail(await detailRes.json());
      const allProposals = await proposalsRes.json();
      setSelectedUserProposals((Array.isArray(allProposals) ? allProposals : []).filter(
        (p: any) => p.userId === mapUser.id && p.status === "active"
      ));
    } catch {}
    setDetailLoading(false);
  }, []);

  const handleEasterEggPress = useCallback((egg: any) => { setSelectedEgg(egg); }, []);

  const handleAdClick = useCallback(async (ad: any) => {
    try { await apiRequest("POST", `/api/ads/${ad.id}/click`); } catch {}
    if (ad.linkUrl) {
      let url = ad.linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { await Linking.openURL(url); } catch {}
    }
  }, []);

  const handleSearch = useCallback(async (text: string) => {
    setSearchText(text);
    if (text.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(text.trim())}`);
      const data = await res.json();
      setSearchResults(data.filter((u: any) => u.id !== user?.id));
    } catch {}
    setSearchLoading(false);
  }, [user?.id]);

  const handleSearchResultPress = useCallback((u: any) => {
    setShowSearchResults(false);
    setSearchText("");
    setSearchResults([]);
    router.push(`/profile/${u.id}` as any);
  }, [router]);

  const handleLocateUser = useCallback((u: any) => {
    setShowOnlineList(false);
    setShowBikerList(false);
    setShowZavorrinaList(false);
    setLastSmallMapCenter({ latitude: u.latitude, longitude: u.longitude });
    const activeRef = mapFullscreen ? fullscreenMapRef : mapRef;
    setTimeout(() => {
      activeRef.current?.focusOnCoordinate({ latitude: u.latitude, longitude: u.longitude });
      handleUserPress({ id: u.id, nickname: u.nickname, userType: u.userType, latitude: u.latitude, longitude: u.longitude });
    }, 300);
  }, [mapFullscreen, handleUserPress]);

  if (authLoading || locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>{t("map.loadingMap")}</Text>
      </View>
    );
  }

  if (Platform.OS === "web" && !location && !contextPositionReady) {
    if (locationPermissionDenied) {
      return (
        <View style={styles.loading}>
          <Ionicons name="location" size={56} color={Colors.error ?? "#e53935"} style={{ marginBottom: 20 }} />
          <Text style={[styles.loadingText, { fontSize: 18, fontWeight: "600", marginBottom: 8 }]}>{t("map.locationDeniedTitle")}</Text>
          <Text style={[styles.loadingText, { fontSize: 14, opacity: 0.7, marginBottom: 28, textAlign: "center", paddingHorizontal: 32 }]}>{t("map.locationDeniedDesc")}</Text>
          <TouchableOpacity onPress={() => Linking.openURL("https://support.google.com/chrome/answer/142065")} style={{ backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("map.openSettings")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (locationPermissionPrompt) {
      return (
        <View style={styles.loading}>
          <Ionicons name="location-outline" size={56} color={Colors.accent} style={{ marginBottom: 20 }} />
          <Text style={[styles.loadingText, { fontSize: 18, fontWeight: "600", marginBottom: 8 }]}>{t("map.waitingLocationTitle")}</Text>
          <Text style={[styles.loadingText, { fontSize: 14, opacity: 0.7, marginBottom: 28, textAlign: "center", paddingHorizontal: 32 }]}>{t("map.waitingLocationDesc")}</Text>
          <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("map.allowLocation")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>{t("map.loadingMap")}</Text>
      </View>
    );
  }

  const currentAd = myAds[adIndex % myAds.length] as any;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 16 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.titleRow}
          onPress={async () => {
            const { data } = await homeMessageQuery.refetch();
            if (data?.enabled) setShowHomeMessage(true);
          }}
          activeOpacity={homeMessageQuery.data?.enabled ? 0.7 : 1}
        >
          <Text style={styles.title}>BikerLink</Text>
          <Image source={require("@/assets/images/helmet-logo.png")} style={styles.helmetLogo} resizeMode="contain" />
        </TouchableOpacity>
        <Pressable style={styles.defineAreaBtnInline} onPress={() => setShowAreaModal(true)}>
          <Ionicons name="globe-outline" size={14} color={Colors.accent} />
          <Text style={styles.defineAreaBtnInlineText} numberOfLines={1}>{areaLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.accent} />
        </Pressable>
        <Pressable onPress={() => router.push("/chat" as any)}>
          <Ionicons name="chatbubbles" size={24} color={Colors.accent} />
        </Pressable>
      </View>

      {/* Search Bar */}
      <MapSearchBar
        searchText={searchText}
        onChangeText={handleSearch}
        onClear={() => { setSearchText(""); setSearchResults([]); setShowSearchResults(false); }}
        searchResults={searchResults}
        searchLoading={searchLoading}
        showSearchResults={showSearchResults}
        onResultPress={handleSearchResultPress}
        currentUserId={user?.id}
      />

      {/* Small Map */}
      <Pressable style={styles.mapContainer} onPress={() => setMapFullscreen(true)}>
        {!mapFullscreen ? (
          <InteractiveMap
            ref={mapRef}
            users={usersWithSelf.filter((u: any) => u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude))}
            workshops={(workshopsQuery.data ?? []).filter((w: any) => w.latitude != null && w.longitude != null && !isNaN(w.latitude) && !isNaN(w.longitude))}
            easterEggs={[]}
            activeSosRequests={(activeSosQuery.data ?? []).filter((s: any) => s.latitude != null && s.longitude != null)}
            isAvailable={isAvailable}
            ghostMode={isGhostMode}
            searchRadiusKm={mySearchRadius}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            onToggleFilterBiker={toggleFilterBiker}
            onToggleFilterZavorrina={toggleFilterZavorrina}
            onUserPress={handleUserPress}
            onEasterEggPress={handleEasterEggPress}
            onEventPress={(id) => router.push({ pathname: "/evento/[id]" as const, params: { id } })}
            onReady={() => setMapReady(true)}
            currentUserId={user?.id ?? null}
            realMeMarker={realMeMarker}
            fakeMeMarker={fakeMeMarker}
            showEventPins={false}
            onRegionChangeComplete={(center) => setLastSmallMapCenter(center)}
            initialCenterOverride={smallMapInitialCenter}
            gpsFollowupEnabled={true}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        )}
        <View style={styles.expandHint}>
          <Ionicons name="expand" size={16} color={Colors.text} />
        </View>
      </Pressable>

      {/* Web location nudges */}
      {Platform.OS === "web" && showLocationNudge && (
        <View style={styles.locationNudge}>
          <View style={styles.locationNudgeContent}>
            <Ionicons name="location-outline" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
            <Text style={styles.locationNudgeText}>{t("home.locationNudge")}</Text>
          </View>
          <View style={styles.locationNudgeActions}>
            <TouchableOpacity style={styles.locationNudgeHowBtn} onPress={() => Linking.openURL("https://support.google.com/chrome/answer/142065")}>
              <Text style={styles.locationNudgeHowText}>{t("home.locationNudgeHow")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.locationNudgeDismissBtn} onPress={async () => { setShowLocationNudge(false); await AsyncStorage.setItem("location_nudge_dismissed", "1").catch(() => {}); }}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {Platform.OS === "web" && webMobilePosition != null && webPhonePositionStatus === "live" && (
        <TouchableOpacity style={styles.webMobilePositionBtn} onPress={() => { setLocation(webMobilePosition); mapRef.current?.focusOnCoordinate(webMobilePosition); }}>
          <Text style={styles.webMobilePositionBtnText}>📍 Dal telefono</Text>
        </TouchableOpacity>
      )}
      {Platform.OS === "web" && webPhonePositionStatus === "stale" && (
        <View style={[styles.webMobilePositionBtn, { borderColor: "#F59E0B" }]}>
          <Text style={[styles.webMobilePositionBtnText, { color: "#F59E0B" }]}>⚠ Posizione non disponibile — apri l'app sul telefono</Text>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => setShowOnlineList(true)}>
          <View style={styles.statTopRow}>
            <Ionicons name="radio-button-on" size={18} color={Colors.success} />
            <Text style={styles.statNumber}>{onlineCount}</Text>
          </View>
          <Text style={styles.statLabel}>{`${t("home.users")}\nOnline`}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setShowBikerList(true)}>
          <View style={styles.statTopRow}>
            <Ionicons name="hand-left" size={18} color={Colors.accent} />
            <Text style={styles.statNumber}>{bikerCount}</Text>
          </View>
          <Text style={styles.statLabel}>{`${t("profile.bikerType")}\n${t("home.available")}`}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setShowZavorrinaList(true)}>
          <View style={styles.statTopRow}>
            <MaterialCommunityIcons name="seat-passenger" size={18} color={Colors.femaleIcon} />
            <Text style={styles.statNumber}>{zavCount}</Text>
          </View>
          <Text style={styles.statLabel}>{`${t("profile.zavorrinaType")}\n${t("home.available")}`}</Text>
        </Pressable>
      </View>

      {/* Ad Banner */}
      {adsGloballyEnabled && myAds.length > 0 && currentAd && (
        <AdBanner key={currentAd.id} ad={currentAd} onPress={handleAdClick} />
      )}

      <InlineMiniPlayer />

      {/* SOS Indicator */}
      <SosSheet
        activeSosRequests={activeSosQuery.data ?? []}
        currentUserId={user?.id}
        showDetail={showSosDetail}
        onOpenDetail={() => setShowSosDetail(true)}
        onCloseDetail={() => setShowSosDetail(false)}
        onAccept={(id) => acceptSosMutation.mutate(id)}
        accepting={acceptSosMutation.isPending}
      />

      {/* User List Sheets */}
      <UserListSheet
        visible={showOnlineList}
        onClose={() => setShowOnlineList(false)}
        title="Utenti Online"
        icon={<Ionicons name="radio-button-on" size={20} color={Colors.success} />}
        data={onlineListQuery.data}
        isLoading={onlineListQuery.isLoading}
        emptyIcon={<Ionicons name="people-outline" size={32} color={Colors.textSecondary} />}
        emptyText={t("home.noUsersOnline")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
        showMoto={true}
        showOfflineToggle={true}
        showOffline={showOfflineOnline}
        offlineCountdown={offlineCountdown.online}
        onToggleOffline={() => {
          const next = !showOfflineOnline;
          setShowOfflineOnline(next);
          if (next) { startOfflineTimer(); queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] }); }
          else setOfflineCountdown({ online: 0 });
        }}
      />

      <UserListSheet
        visible={showBikerList}
        onClose={() => setShowBikerList(false)}
        title={`${t("profile.bikerType")} ${t("home.available")}`}
        icon={<Ionicons name="hand-left" size={20} color={Colors.accent} />}
        data={bikerListQuery.data}
        isLoading={bikerListQuery.isLoading}
        emptyIcon={<Ionicons name="bicycle" size={32} color={Colors.textSecondary} />}
        emptyText={t("map.noBikerAvailable")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
        showMoto={true}
      />

      <UserListSheet
        visible={showZavorrinaList}
        onClose={() => setShowZavorrinaList(false)}
        title={`${t("profile.zavorrinaType")} ${t("home.available")}`}
        icon={<MaterialCommunityIcons name="seat-passenger" size={20} color={Colors.femaleIcon} />}
        data={zavListQuery.data}
        isLoading={zavListQuery.isLoading}
        emptyIcon={<MaterialCommunityIcons name="seat-passenger" size={32} color={Colors.textSecondary} />}
        emptyText={t("match.noPassenger")}
        currentUserId={user?.id}
        onLocateUser={handleLocateUser}
      />

      {/* User Detail Sheet */}
      <UserDetailSheet
        selectedUser={selectedUser}
        selectedUserDetail={selectedUserDetail}
        selectedUserProposals={selectedUserProposals}
        detailLoading={detailLoading}
        onClose={() => setSelectedUser(null)}
        onPhotoPress={(uri) => setSelectedMapPhoto(uri)}
        myOrganizedEvents={myOrganizedEventsQuery.data ?? []}
        targetUserEventIds={targetUserEventIdsQuery.data ?? []}
        currentUserId={user?.id}
      />

      {/* Easter Egg Sheet */}
      <EasterEggSheet
        egg={selectedEgg}
        onClose={() => setSelectedEgg(null)}
        onCollect={(id) => collectEggMutation.mutate(id)}
        collecting={collectEggMutation.isPending}
      />

      {/* Photo Lightbox */}
      <PhotoLightbox photoUri={selectedMapPhoto} onClose={() => setSelectedMapPhoto(null)} />

      {/* Home Message */}
      <HomeMessageModal
        visible={showHomeMessage}
        text={homeMessageQuery.data?.text || ""}
        onClose={() => setShowHomeMessage(false)}
      />

      {/* Area Selector */}
      <AreaSelectorModal
        visible={showAreaModal}
        selectedCountries={selectedCountries}
        onToggleCountry={toggleCountryInModal}
        onToggleContinent={toggleContinentInModal}
        onSave={() => saveCountries(selectedCountries)}
        onClose={() => setShowAreaModal(false)}
      />

      {/* Focus toast */}
      {focusToast != null && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 120,
            left: 24,
            right: 24,
            alignItems: "center",
            opacity: focusToastAnim,
            transform: [{ translateY: focusToastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            zIndex: 9999,
          }}
        >
          <View style={{ backgroundColor: "rgba(30,30,30,0.92)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,102,0,0.4)" }}>
            <Ionicons name="navigate" size={16} color="#FF6600" />
            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>{focusToast}</Text>
          </View>
        </Animated.View>
      )}

      {/* Fullscreen Map */}
      <FullscreenMapModal
        visible={mapFullscreen}
        onClose={() => setMapFullscreen(false)}
        mapRef={fullscreenMapRef}
        users={usersWithSelf.filter((u: any) => u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude))}
        workshops={(workshopsQuery.data ?? []).filter((w: any) => w.latitude != null && w.longitude != null && !isNaN(w.latitude) && !isNaN(w.longitude))}
        easterEggs={(easterEggsQuery.data ?? []).filter((e: any) => e.latitude != null && e.longitude != null && !isNaN(e.latitude) && !isNaN(e.longitude))}
        activeSosRequests={(activeSosQuery.data ?? []).filter((s: any) => s.latitude != null && s.longitude != null)}
        isAvailable={isAvailable}
        ghostMode={isGhostMode}
        searchRadiusKm={mySearchRadius}
        filterBiker={filterBiker}
        filterZavorrina={filterZavorrina}
        filterClubs={filterClubs}
        filterEvents={filterEvents}
        onToggleFilterBiker={toggleFilterBiker}
        onToggleFilterZavorrina={toggleFilterZavorrina}
        onToggleFilterClubs={toggleFilterClubs}
        onToggleFilterEvents={toggleFilterEvents}
        onUserPress={handleUserPress}
        onEasterEggPress={handleEasterEggPress}
        onEventPress={(id) => { setMapFullscreen(false); router.push({ pathname: "/evento/[id]" as const, params: { id } }); }}
        onClubPress={(club) => { setMapFullscreen(false); router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } }); }}
        onProposeClubLocation={(club) => { setMapFullscreen(false); router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } }); }}
        currentUserId={user?.id ?? null}
        realMeMarker={realMeMarker}
        fakeMeMarker={fakeMeMarker}
        clubPins={clubPinsQuery.data ?? []}
        initialCenterOverride={lastSmallMapCenter}
        filterBarTopOffset={insets.top}
        onShowAreaModal={() => setShowAreaModal(true)}
        areaLabel={areaLabel}
        onRegionChangeComplete={undefined}
        searchText={searchText}
        onSearch={handleSearch}
        onClearSearch={() => { setSearchText(""); setSearchResults([]); setShowSearchResults(false); }}
        searchResults={searchResults}
        searchLoading={searchLoading}
        showSearchResults={showSearchResults}
        onSearchResultPress={handleSearchResultPress}
        currentUserFullId={user?.id}
        onlineCount={onlineCount}
        bikerCount={bikerCount}
        zavCount={zavCount}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isReady={mapFullscreenReady}
        getUserIcon={getUserIcon}
        getUserColor={getUserColor}
        getUserTypeLabel={(u) => getUserTypeLabel(u, t)}
      />
    </ScrollView>
  );
}
