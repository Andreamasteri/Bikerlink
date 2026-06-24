/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { Animated, Linking, Alert } from "react-native";
import { InteractiveMapHandle } from "@/components/InteractiveMap";
import { apiRequest, queryClient } from "@/lib/query-client";
import { CONTINENT_MAP, getCountryByCode } from "@/lib/countries-regions";

export function handleFocusAnimation(nickname: string, setFocusToast: (v: string | null) => void, focusToastAnim: Animated.Value) {
  setFocusToast(`Vista centrata su ${nickname}`);
  Animated.sequence([
    Animated.timing(focusToastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    Animated.delay(2200),
    Animated.timing(focusToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
  ]).start(() => setFocusToast(null));
}

export function focusMap(mapRef: React.RefObject<InteractiveMapHandle | null>, lat: number, lng: number, userId?: string) {
  mapRef.current?.focusOnCoordinate({ latitude: lat, longitude: lng, userId });
}

export const useHomeMapStates = () => {
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [selectedMapPhoto, setSelectedMapPhoto] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedUserProposals, setSelectedUserProposals] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEgg, setSelectedEgg] = useState<any | null>(null);
  const [showOnlineList, setShowOnlineList] = useState(false);
  const [showBikerList, setShowBikerList] = useState(false);
  const [showZavorrinaList, setShowZavorrinaList] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const [showOfflineOnline, setShowOfflineOnline] = useState(false);
  const [showSosDetail, setShowSosDetail] = useState(false);
  const [offlineCountdown, setOfflineCountdown] = useState<{ online: number }>({ online: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [countriesLoaded, setCountriesLoaded] = useState(false);
  const [showHomeMessage, setShowHomeMessage] = useState(false);
  const [lastSmallMapCenter, setLastSmallMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  return {
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
  };
};

export const useHomeMapHandlers = (
  setSelectedUser: (v: any) => void,
  setDetailLoading: (v: boolean) => void,
  setSelectedUserDetail: (v: any) => void,
  setSelectedUserProposals: (v: any[]) => void,
  setSelectedEgg: (v: any) => void,
  setSearchText: (v: string) => void,
  setSearchResults: (v: any[]) => void,
  setShowSearchResults: (v: boolean) => void,
  setSearchLoading: (v: boolean) => void,
  user: any,
  router: any,
  setShowOnlineList: (v: boolean) => void,
  setShowBikerList: (v: boolean) => void,
  setShowZavorrinaList: (v: boolean) => void,
  setLastSmallMapCenter: (v: any) => void,
  mapRef: any,
  setFocusToast: (v: any) => void,
  focusToastAnim: any,
) => {
  const handleUserPress = async (mapUser: any) => {
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
      setSelectedUserProposals(((Array.isArray(allProposals) ? allProposals : []) as any[]).filter(
        (p: any) => p.userId === mapUser.id && p.status === "active"
      ));
    } catch {
      // no-op
    }
    setDetailLoading(false);
  };

  const handleEasterEggPress = (egg: any) => { setSelectedEgg(egg); };

  const handleAdClick = async (ad: any) => {
    try { await apiRequest("POST", `/api/ads/${ad.id}/click`); } catch {
      // no-op
    }
    if (ad.linkUrl) {
      let url = ad.linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      try { await Linking.openURL(url); } catch {
        // no-op
      }
    }
  };

  const handleSearch = async (text: string) => {
    setSearchText(text);
    if (text.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    setSearchLoading(true);
    setShowSearchResults(true);
    try {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(text.trim())}`);
      const data = await res.json();
      setSearchResults((data as any[]).filter((u) => u.id !== user?.id));
    } catch {
      // no-op
    }
    setSearchLoading(false);
  };

  const handleSearchResultPress = (u: any) => {
    setShowSearchResults(false);
    setSearchText("");
    setSearchResults([]);
    router.push(`/profile/${u.id}` as never);
  };

  const handleLocateUser = (u: any) => {
    setShowOnlineList(false);
    setShowBikerList(false);
    setShowZavorrinaList(false);
    const lat = Number(u.latitude);
    const lng = Number(u.longitude);
    setLastSmallMapCenter({ latitude: lat, longitude: lng });
    setTimeout(() => {
      focusMap(mapRef, lat, lng, String(u.id));
      handleUserPress({ id: u.id, nickname: u.nickname, userType: u.userType, latitude: lat, longitude: lng });
      if (u.nickname) {
        handleFocusAnimation(u.nickname, setFocusToast, focusToastAnim);
      }
    }, 300);
  };

  return {
    handleUserPress,
    handleEasterEggPress,
    handleAdClick,
    handleSearch,
    handleSearchResultPress,
    handleLocateUser,
  };
};

export function getAreaLabel(selectedCountries: string[]) {
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
}

export function handleAutoCollecting(easterEggsQueryData: any[], autoCollectingRef: React.MutableRefObject<Set<string>>, t: any) {
  const nearbyEggs = (easterEggsQueryData as any[]) || [];
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
        .catch(() => {})
        .finally(() => { autoCollectingRef.current.delete(egg.id); });
    });
  }
}

export const useHomeMapCalculated = (mapData: any, nearbyUsers: any[], user: any, location: any, filterBiker: boolean, filterZavorrina: boolean, profileQData: any) => {
  const onlineCount = mapData.onlineCountQuery.data?.count ?? 0;
  const bikerCount = mapData.bikerCountQuery.data?.count ?? 0;
  const zavCount = mapData.zavCountQuery.data?.count ?? 0;

  const usersWithSelf = useMemo(() => {
    const rawList: any[] = Array.isArray(nearbyUsers) ? nearbyUsers : [];
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
    const proposals = Array.isArray(mapData.myProposalsQuery.data) ? mapData.myProposalsQuery.data as any[] : [];
    const myActive = proposals.filter(
      (p) => p.userId === user?.id && p.status === "active" && p.searchRadius
    );
    if (myActive.length === 0) return 0;
    return Math.max(...myActive.map((p) => p.searchRadius || 0));
  }, [mapData.myProposalsQuery.data, user?.id]);

  return {
    onlineCount,
    bikerCount,
    zavCount,
    usersWithSelf,
    smallMapInitialCenter,
    mySearchRadius,
  };
};
