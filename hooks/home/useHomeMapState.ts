import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Linking, Alert, Animated } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useLocationGate } from "@/lib/location-context";
import { useSetting } from "@/lib/settings-context";
import { useT } from "@/lib/language-context";
import { useMapFilters } from "@/hooks/useMapFilters";
import { useMapLocation } from "@/hooks/useMapLocation";
import { useMapData } from "@/hooks/useMapData";
import { CONTINENT_MAP, getCountryByCode } from "@/lib/countries-regions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient } from "@/lib/query-client";
import { InteractiveMapHandle } from "@/components/InteractiveMap";
import type { User } from "@shared/db";
import { sendStartupBeacon } from "@/lib/startup-beacon";

type UserWithProfileCoords = Omit<User, "password"> & {
  profileLatitude?: number | null;
  profileLongitude?: number | null;
};

interface MapUser {
  id: string | number;
  nickname?: string | null;
  userType?: string | null;
  sex?: string | null;
  country?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
}

interface EasterEgg {
  id: string;
  collected?: boolean;
  [key: string]: unknown;
}

interface Ad {
  id: string;
  rotationDuration?: number;
  rotationMode?: string;
  linkUrl?: string;
  [key: string]: unknown;
}

interface ProfileQueryData {
  isAvailable?: boolean;
  ghostMode?: boolean;
  fakeHomeEnabled?: boolean;
  fakeHomeLatitude?: number | null;
  fakeHomeLongitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  fixedPositionEnabled?: boolean;
}

interface ProposalItem {
  userId?: string | number;
  status?: string;
  searchRadius?: number;
  [key: string]: unknown;
}

export function useHomeMapState() {
  const router = useRouter();
  const { focusLat: focusLatParam, focusLng: focusLngParam } = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const t = useT();
  const { positionReady: contextPositionReady, requestPermission } = useLocationGate();

  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MapUser | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<MapUser | null>(null);
  const [selectedMapPhoto, setSelectedMapPhoto] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<MapUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedUserProposals, setSelectedUserProposals] = useState<ProposalItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEgg, setSelectedEgg] = useState<EasterEgg | null>(null);
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
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [countriesLoaded, setCountriesLoaded] = useState(false);
  const [showHomeMessage, setShowHomeMessage] = useState(false);
  const [lastSmallMapCenter, setLastSmallMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastFocusParamRef = useRef<string | null>(null);
  const [pendingFocusCoords, setPendingFocusCoords] = useState<{ lat: number; lng: number; userId?: string; nickname?: string } | null>(null);
  const [focusToast, setFocusToast] = useState<string | null>(null);
  const focusToastAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAuthenticated) {
      sendStartupBeacon("home_init");
    }
  }, [isAuthenticated]);

  const {
    filterBiker,
    filterZavorrina,
    filterClubs,
    filterEvents,
    motoTags,
    toggleFilterBiker,
    toggleFilterZavorrina,
    toggleFilterClubs,
    toggleFilterEvents,
    setMotoTags,
  } = useMapFilters({ user, isAuthenticated });

  const typedUser = user as UserWithProfileCoords | null | undefined;

  const { location, locationLoading, setLocation } = useMapLocation({
    userRegion: user?.region,
    userCountry: user?.country,
    profileLat: typedUser?.profileLatitude,
    profileLng: typedUser?.profileLongitude,
  });

  const countriesQueryParam = useMemo(() => {
    if (!countriesLoaded || selectedCountries.length === 0) return "";
    return selectedCountries.join(",");
  }, [selectedCountries, countriesLoaded]);

  const mapData = useMapData({
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
    selectedUserId: selectedUser?.id != null ? String(selectedUser.id) : undefined,
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
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (mapReady) return;
    const timer = setTimeout(() => setMapReady(true), 2000);
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
        } catch {
          // no-op: ignore JSON parsing or storage read errors
        }
      })();
    }, [])
  );

  useEffect(() => {
    if (!mapReady) return;
    if (focusLatParam && focusLngParam) {
      const key = `${focusLatParam},${focusLngParam}`;
      if (lastFocusParamRef.current !== key) {
        lastFocusParamRef.current = key;
        const lat = parseFloat(focusLatParam);
        const lng = parseFloat(focusLngParam);
        if (!isNaN(lat) && !isNaN(lng)) {
          mapRef.current?.focusOnCoordinate({ latitude: lat, longitude: lng });
        }
      }
    }

    if (!pendingFocusCoords) return;
    const { lat, lng, userId, nickname } = pendingFocusCoords;
    setPendingFocusCoords(null);

    mapRef.current?.focusOnCoordinate({ latitude: lat, longitude: lng, userId });

    if (nickname) {
      setFocusToast(`Vista centrata su ${nickname}`);
      Animated.sequence([
        Animated.timing(focusToastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(focusToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setFocusToast(null));
    }
  }, [mapReady, pendingFocusCoords, focusLatParam, focusLngParam, focusToastAnim]);


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
      } catch {
        // no-op: ignore JSON parsing or storage read errors
      }
      setSelectedCountries([]);
      try { await AsyncStorage.setItem("map_area_countries", JSON.stringify([])); } catch {
        // no-op: ignore storage write failures
      }
      setCountriesLoaded(true);
    })();
  }, []);

  const { invalidateCountryQueries } = mapData;
  const saveCountries = useCallback(async (countries: string[]) => {
    setSelectedCountries(countries);
    try { await AsyncStorage.setItem("map_area_countries", JSON.stringify(countries)); } catch {
      // no-op: ignore storage write failures
    }
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
    if (!Array.isArray(selectedCountries) || selectedCountries.length === 0) return "🌍 Tutto il mondo";
    try {
      for (const continent of CONTINENT_MAP) {
        const allInContinent = continent.countryCodes.every((c) => selectedCountries.includes(c));
        const onlyContinent = selectedCountries.every((c) => continent.countryCodes.includes(c));
        if (allInContinent && onlyContinent && selectedCountries.length === continent.countryCodes.length) return `${continent.label}`;
      }
      if (selectedCountries.length === 1) {
        const country = typeof getCountryByCode === "function" ? getCountryByCode(selectedCountries[0]) : undefined;
        return country ? `${country.flag} ${country.name}` : selectedCountries[0];
      }
      return `${selectedCountries.length} paesi`;
    } catch {
      return `${selectedCountries.length} ${selectedCountries.length === 1 ? "paese" : "paesi"}`;
    }
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

  const profileQData = mapData.profileQuery.data as ProfileQueryData | undefined;
  const isAvailable = profileQData?.isAvailable || false;
  const isGhostMode = profileQData?.ghostMode || false;
  const fakeHomeEnabled = profileQData?.fakeHomeEnabled || false;
  const fakeHomeLat = profileQData?.fakeHomeLatitude ?? null;
  const fakeHomeLng = profileQData?.fakeHomeLongitude ?? null;
  const fixedPositionEnabled = profileQData?.fixedPositionEnabled ?? false;
  const realMeMarker = fakeHomeEnabled && fakeHomeLat != null && fakeHomeLng != null && location != null
    ? { latitude: location.latitude, longitude: location.longitude } : null;
  const fakeMeMarker = fakeHomeEnabled && fakeHomeLat != null && fakeHomeLng != null
    ? { latitude: Number(fakeHomeLat), longitude: Number(fakeHomeLng) } : null;

  const myAds = useMemo(() => Array.isArray(mapData.myAdsQuery.data) ? mapData.myAdsQuery.data : [], [mapData.myAdsQuery.data]);
  const onlineCount = mapData.onlineCountQuery.data?.count ?? 0;
  const bikerCount = mapData.bikerCountQuery.data?.count ?? 0;
  const zavCount = mapData.zavCountQuery.data?.count ?? 0;

  const nearbyUsers = useMemo(() => Array.isArray(mapData.nearbyUsersQuery.data) ? mapData.nearbyUsersQuery.data as MapUser[] : [], [mapData.nearbyUsersQuery.data]);

  const usersWithSelf = useMemo(() => {
    const rawList: MapUser[] = Array.isArray(nearbyUsers) ? nearbyUsers : [];
    if (!user || !location) return rawList;
    const alreadyPresent = rawList.some((u) => u.id === user.id);
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
      const visibleUsers = usersWithSelf.filter((u) => {
        if (u.latitude == null || u.longitude == null || isNaN(Number(u.latitude)) || isNaN(Number(u.longitude))) return false;
        if (user?.id != null && u.id === user.id) return true;
        if (u.userType === "biker" && !filterBiker) return false;
        if (u.userType === "zavorrina" && !filterZavorrina) return false;
        return true;
      });
      if (visibleUsers.length > 0) {
        const lat = visibleUsers.reduce((s: number, u) => s + Number(u.latitude), 0) / visibleUsers.length;
        const lng = visibleUsers.reduce((s: number, u) => s + Number(u.longitude), 0) / visibleUsers.length;
        return { latitude: lat, longitude: lng };
      }
    }
    const savedLat = profileQData?.latitude;
    const savedLng = profileQData?.longitude;
    if (savedLat != null && savedLng != null && !isNaN(Number(savedLat)) && !isNaN(Number(savedLng))) {
      return { latitude: Number(savedLat), longitude: Number(savedLng) };
    }
    return null;
  }, [filterBiker, filterZavorrina, usersWithSelf, user?.id, profileQData]);

  const mySearchRadius = useMemo(() => {
    const proposals = Array.isArray(mapData.myProposalsQuery.data) ? mapData.myProposalsQuery.data as ProposalItem[] : [];
    const myActive = proposals.filter(
      (p) => p.userId === user?.id && p.status === "active" && p.searchRadius
    );
    if (myActive.length === 0) return 0;
    return Math.max(...myActive.map((p) => p.searchRadius || 0));
  }, [mapData.myProposalsQuery.data, user?.id]);

  const autoCollectingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nearbyEggs = (mapData.easterEggsQuery.data as EasterEgg[]) || [];
    const uncollected = nearbyEggs.filter((e) => !e.collected && !autoCollectingRef.current.has(e.id));
    if (uncollected.length > 0) {
      uncollected.forEach((egg) => {
        autoCollectingRef.current.add(egg.id);
        apiRequest("POST", `/api/easter-eggs/${egg.id}/collect`)
          .then((res) => res.json())
          .then((data: { prizeUnlocked?: boolean; message?: string }) => {
            if (data.prizeUnlocked) Alert.alert(t("home.easterEggPrize"), data.message || t("home.easterEgg10Msg"));
            else Alert.alert(t("home.easterEggTitle"), data.message || t("home.easterEggCongrats"));
            queryClient.invalidateQueries({ queryKey: ["/api/easter-eggs/nearby"] });
          })
          .catch(() => {
            // no-op: ignore egg collection failures
          })
          .finally(() => { autoCollectingRef.current.delete(egg.id); });
      });
    }
  }, [mapData.easterEggsQuery.data, t]);

  useEffect(() => {
    if (myAds.length <= 1) return;
    const firstAd = myAds[0] as Ad;
    const duration = (firstAd?.rotationDuration || 10) * 1000;
    const mode = firstAd?.rotationMode || "sequential";
    const timer = setInterval(() => {
      setAdIndex((prev) => mode === "random" ? Math.floor(Math.random() * myAds.length) : (prev + 1) % myAds.length);
    }, duration);
    return () => clearInterval(timer);
  }, [myAds]);

  const handleUserPress = useCallback(async (mapUser: MapUser) => {
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
      setSelectedUserProposals(((Array.isArray(allProposals) ? allProposals : []) as ProposalItem[]).filter(
        (p) => p.userId === mapUser.id && p.status === "active"
      ));
    } catch {
      // no-op: ignore user public detail fetch failures
    }
    setDetailLoading(false);
  }, []);

  const handleEasterEggPress = useCallback((egg: EasterEgg) => { setSelectedEgg(egg); }, []);

  const handleAdClick = useCallback(async (ad: Ad) => {
    try { await apiRequest("POST", `/api/ads/${ad.id}/click`); } catch {
      // no-op: ignore ad click logging failures
    }
    if (ad.linkUrl) {
      let url = ad.linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { await Linking.openURL(url); } catch {
        // no-op: ignore browser opening failures
      }
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
      setSearchResults((data as MapUser[]).filter((u) => u.id !== user?.id));
    } catch {
      // no-op: ignore user search failures
    }
    setSearchLoading(false);
  }, [user?.id]);

  const handleSearchResultPress = useCallback((u: MapUser) => {
    setShowSearchResults(false);
    setSearchText("");
    setSearchResults([]);
    router.push(`/profile/${u.id}` as never);
  }, [router]);

  const handleLocateUser = useCallback((u: MapUser) => {
    setShowOnlineList(false);
    setShowBikerList(false);
    setShowZavorrinaList(false);
    const lat = Number(u.latitude);
    const lng = Number(u.longitude);
    setLastSmallMapCenter({ latitude: lat, longitude: lng });
    setTimeout(() => {
      mapRef.current?.focusOnCoordinate({ latitude: lat, longitude: lng, userId: String(u.id) });
      handleUserPress({ id: u.id, nickname: u.nickname, userType: u.userType, latitude: lat, longitude: lng });
      if (u.nickname) {
        setFocusToast(`Vista centrata su ${u.nickname}`);
        Animated.sequence([
          Animated.timing(focusToastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.delay(2200),
          Animated.timing(focusToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setFocusToast(null));
      }
    }, 300);
  }, [handleUserPress, focusToastAnim]);

  return {
    user,
    isAuthenticated,
    authLoading,
    t,
    contextPositionReady,
    requestPermission,
    mapFullscreen,
    setMapFullscreen,
    selectedUser,
    setSelectedUser,
    selectedUserDetail,
    selectedMapPhoto,
    setSelectedMapPhoto,
    searchText,
    setSearchText,
    searchResults,
    setSearchResults,
    searchLoading,
    showSearchResults,
    setShowSearchResults,
    selectedUserProposals,
    detailLoading,
    selectedEgg,
    setSelectedEgg,
    showOnlineList,
    setShowOnlineList,
    showBikerList,
    setShowBikerList,
    showZavorrinaList,
    setShowZavorrinaList,
    adIndex,
    showOfflineOnline,
    setShowOfflineOnline,
    showSosDetail,
    setShowSosDetail,
    offlineCountdown,
    setOfflineCountdown,
    mapReady,
    setMapReady,
    mapRef,
    selectedCountries,
    showAreaModal,
    setShowAreaModal,
    showHomeMessage,
    setShowHomeMessage,
    lastSmallMapCenter,
    setLastSmallMapCenter,
    filterBiker,
    filterZavorrina,
    filterClubs,
    filterEvents,
    motoTags,
    toggleFilterBiker,
    toggleFilterZavorrina,
    toggleFilterClubs,
    toggleFilterEvents,
    setMotoTags,
    location,
    locationLoading,
    setLocation,
    mapData,
    saveCountries,
    toggleCountryInModal,
    toggleContinentInModal,
    areaLabel,
    startOfflineTimer,
    isAvailable,
    isGhostMode,
    fixedPositionEnabled,
    realMeMarker,
    fakeMeMarker,
    onlineCount,
    bikerCount,
    zavCount,
    usersWithSelf,
    smallMapInitialCenter,
    mySearchRadius,
    handleUserPress,
    handleEasterEggPress,
    handleAdClick,
    handleSearch,
    handleSearchResultPress,
    handleLocateUser,
    myAds,
    focusToast,
    focusToastAnim,
  };
}
