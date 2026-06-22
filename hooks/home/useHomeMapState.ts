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
import { handleFocusAnimation, focusMap, useHomeMapHandlers, getAreaLabel, handleAutoCollecting, useHomeMapStates, useHomeMapCalculated } from "./useHomeMapState.part2";

import { useHomeAds, useHomeSearch } from "./useHomeMapState.hooks";

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
  const { positionReady: contextPositionReady, requestPermission, currentPosition } = useLocationGate();

  const {
    mapFullscreen, setMapFullscreen,
    selectedUser, setSelectedUser,
    selectedUserDetail, setSelectedUserDetail,
    selectedMapPhoto, setSelectedMapPhoto,
    searchText, setSearchText,
    searchResults, setSearchResults,
    searchLoading, setSearchLoading,
    showSearchResults, setShowSearchResults,
    selectedUserProposals, setSelectedUserProposals,
    detailLoading, setDetailLoading,
    selectedEgg, setSelectedEgg,
    showOnlineList, setShowOnlineList,
    showBikerList, setShowBikerList,
    showZavorrinaList, setShowZavorrinaList,
    adIndex, setAdIndex,
    showOfflineOnline, setShowOfflineOnline,
    showSosDetail, setShowSosDetail,
    offlineCountdown, setOfflineCountdown,
    mapReady, setMapReady,
    selectedCountries, setSelectedCountries,
    showAreaModal, setShowAreaModal,
    countriesLoaded, setCountriesLoaded,
    showHomeMessage, setShowHomeMessage,
    lastSmallMapCenter, setLastSmallMapCenter,
  } = useHomeMapStates();

  const sosEnabled = useSetting("sosEnabled");
  const mapRef = useRef<InteractiveMapHandle>(null);
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

  const [filterVessels, setFilterVessels] = useState(false);
  const toggleFilterVessels = useCallback(() => setFilterVessels((v) => !v), []); const aisEnabled = !!(user as { aisEnabled?: boolean } | null)?.aisEnabled;
  const typedUser = user as UserWithProfileCoords | null | undefined;

  const { location, locationLoading, setLocation } = useMapLocation({
    userRegion: user?.region,
    userCountry: user?.country,
    profileLat: typedUser?.profileLatitude,
    profileLng: typedUser?.profileLongitude,
    currentPosition,
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

    focusMap(mapRef, lat, lng, userId);

    if (nickname) {
      handleFocusAnimation(nickname, setFocusToast, focusToastAnim);
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

  const areaLabel = useMemo(() => getAreaLabel(selectedCountries), [selectedCountries]);

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
  const nearbyUsers = useMemo(() => Array.isArray(mapData.nearbyUsersQuery.data) ? mapData.nearbyUsersQuery.data as MapUser[] : [], [mapData.nearbyUsersQuery.data]);

  const {
    onlineCount,
    bikerCount,
    zavCount,
    usersWithSelf,
    smallMapInitialCenter,
    mySearchRadius,
  } = useHomeMapCalculated(mapData, nearbyUsers, user, location, filterBiker, filterZavorrina, profileQData);

  const autoCollectingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    handleAutoCollecting(mapData.easterEggsQuery.data as EasterEgg[], autoCollectingRef, t);
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

  const {
    handleUserPress,
    handleEasterEggPress,
    handleAdClick,
    handleSearch,
    handleSearchResultPress,
    handleLocateUser,
  } = useHomeMapHandlers(
    setSelectedUser,
    setDetailLoading,
    setSelectedUserDetail,
    setSelectedUserProposals,
    setSelectedEgg,
    setSearchText,
    setSearchResults,
    setShowSearchResults,
    setSearchLoading,
    user,
    router,
    setShowOnlineList,
    setShowBikerList,
    setShowZavorrinaList,
    setLastSmallMapCenter,
    mapRef,
    setFocusToast,
    focusToastAnim,
  );

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
    filterVessels, toggleFilterVessels, aisEnabled,
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
