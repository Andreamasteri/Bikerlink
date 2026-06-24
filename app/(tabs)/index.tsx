import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getUserColor, getUserTypeLabel, getUserIcon } from "@/lib/mapUserUtils";
import { Ionicons } from "@expo/vector-icons";
import MapSearchBar from "@/components/map/MapSearchBar";
import AdBanner from "@/components/map/AdBanner";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeStatsRow } from "@/components/home/HomeStatsRow";
import { HomeMapSection } from "@/components/home/HomeMapSection";
import { HomeModalsAndSheets } from "@/components/home/HomeModalsAndSheets";
import { HomeFullscreenMap } from "@/components/home/HomeFullscreenMap";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import InteractiveMap from "@/components/InteractiveMap";
import { useHomeMapState } from "@/hooks/home/useHomeMapState";
import mapScreenStyles from "@/components/map/mapScreenStyles";
import type { ClubMapPin } from "@/components/InteractiveMap";

interface CardLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

function MapScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const {
    user,
    authLoading,
    t,
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
    setMapReady,
    mapRef,
    selectedCountries,
    showAreaModal,
    setShowAreaModal,
    showHomeMessage,
    setShowHomeMessage,
    lastSmallMapCenter: _lastSmallMapCenter,
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
    locationLoading,
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
  } = useHomeMapState();

  const rootViewRef = useRef<View>(null);
  const [compactLayout, setCompactLayout] = useState<CardLayout | null>(null);
  const firstLayoutDoneRef = useRef(false);
  const [brokenAdIds, setBrokenAdIds] = useState<Set<string>>(new Set());
  const validAds = myAds.filter((ad) => !brokenAdIds.has(ad.id));
  const handleAdImageFailed = (id: string) => {
    setBrokenAdIds((prev) => new Set([...prev, id]));
  };
  const animTop = useRef(new Animated.Value(0)).current;
  const animLeft = useRef(new Animated.Value(0)).current;
  const animWidth = useRef(new Animated.Value(screenWidth)).current;
  const animHeight = useRef(new Animated.Value(screenHeight)).current;
  const animRadius = useRef(new Animated.Value(0)).current;

  const handleCardLayout = (layout: CardLayout) => {
    setCompactLayout(layout);
    firstLayoutDoneRef.current = true;
    // Keep the compact (non-fullscreen) overlay glued to the latest measured
    // placeholder position. HomeMapSection may report twice: first from the
    // guaranteed onLayout event, then a refined measureLayout(root) value.
    // Syncing the animated values on every compact report (not just the first)
    // ensures the refinement actually repositions the overlay instead of being
    // ignored — otherwise an approximate first value could leave the map
    // visually misaligned ("mappa fuori posto").
    if (!mapFullscreen) {
      animTop.setValue(layout.top);
      animLeft.setValue(layout.left);
      animWidth.setValue(layout.width);
      animHeight.setValue(layout.height);
      animRadius.setValue(20);
    }
  };

  useEffect(() => {
    if (!compactLayout) return;
    if (mapFullscreen) {
      Animated.parallel([
        Animated.timing(animTop, { toValue: 0, duration: 250, useNativeDriver: false }),
        Animated.timing(animLeft, { toValue: 0, duration: 250, useNativeDriver: false }),
        Animated.timing(animWidth, { toValue: screenWidth, duration: 250, useNativeDriver: false }),
        Animated.timing(animHeight, { toValue: screenHeight, duration: 250, useNativeDriver: false }),
        Animated.timing(animRadius, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(animTop, { toValue: compactLayout.top, duration: 250, useNativeDriver: false }),
        Animated.timing(animLeft, { toValue: compactLayout.left, duration: 250, useNativeDriver: false }),
        Animated.timing(animWidth, { toValue: compactLayout.width, duration: 250, useNativeDriver: false }),
        Animated.timing(animHeight, { toValue: compactLayout.height, duration: 250, useNativeDriver: false }),
        Animated.timing(animRadius, { toValue: 20, duration: 250, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (finished) {
          setTimeout(() => {
            mapRef.current?.invalidateSize();
          }, 50);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFullscreen]);

  if (authLoading || locationLoading) {
    return (
      <View style={mapScreenStyles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={mapScreenStyles.loadingText}>{t("map.loadingMap")}</Text>
      </View>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ad shape from API
  const currentAd = validAds.length > 0 ? validAds[adIndex % validAds.length] as any : null;

  const filteredUsers = usersWithSelf.filter(
    (u) => u.latitude != null && u.longitude != null && !isNaN(u.latitude as number) && !isNaN(u.longitude as number)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const filteredWorkshops = ((mapData.workshopsQuery.data ?? []) as { latitude?: number | null; longitude?: number | null }[]).filter(
    (w) => w.latitude != null && w.longitude != null && !isNaN(w.latitude as number) && !isNaN(w.longitude as number)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const filteredEasterEggs = ((mapData.easterEggsQuery.data ?? []) as { latitude?: number | null; longitude?: number | null }[]).filter(
    (e) => e.latitude != null && e.longitude != null && !isNaN(e.latitude as number) && !isNaN(e.longitude as number)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const filteredBusinesses = ((mapData.businessesQuery.data ?? []) as { latitude?: number | null; longitude?: number | null }[]).filter(
    (b) => b.latitude != null && b.longitude != null && !isNaN(b.latitude as number) && !isNaN(b.longitude as number)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const filteredSosRequests = ((mapData.activeSosQuery.data ?? []) as { latitude?: number | null; longitude?: number | null }[]).filter(
    (s) => s.latitude != null && s.longitude != null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  return (
    <View ref={rootViewRef} style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Scrollable content */}
      <ScrollView
        style={[mapScreenStyles.container, { backgroundColor: Colors.background }]}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 16 }}
      >
        <HomeHeader
          areaLabel={areaLabel}
          onShowAreaModal={() => setShowAreaModal(true)}
          onShowHomeMessage={async () => {
            const { data } = await mapData.homeMessageQuery.refetch();
            if (data?.enabled) setShowHomeMessage(true);
          }}
          onChatPress={() => router.push("/chat" as never)}
          homeMessageEnabled={mapData.homeMessageQuery.data?.enabled ?? false}
        />

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

        {/* Map placeholder — reserves layout space; actual map rendered below */}
        <HomeMapSection onCardLayout={handleCardLayout} rootRef={rootViewRef} />

        <HomeStatsRow
          onlineCount={onlineCount}
          bikerCount={bikerCount}
          zavCount={zavCount}
          onShowOnlineList={() => setShowOnlineList(true)}
          onShowBikerList={() => setShowBikerList(true)}
          onShowZavorrinaList={() => setShowZavorrinaList(true)}
          t={t}
        />

        {mapData.adsGloballyEnabled && validAds.length > 0 && currentAd && (
          <AdBanner key={currentAd.id} ad={currentAd} onPress={handleAdClick} onImagePermanentlyFailed={handleAdImageFailed} />
        )}

        <InlineMiniPlayer />

        <HomeModalsAndSheets
          showOnlineList={showOnlineList}
          setShowOnlineList={setShowOnlineList}
          showBikerList={showBikerList}
          setShowBikerList={setShowBikerList}
          showZavorrinaList={showZavorrinaList}
          setShowZavorrinaList={setShowZavorrinaList}
          showOfflineOnline={showOfflineOnline}
          setShowOfflineOnline={setShowOfflineOnline}
          onlineListQuery={mapData.onlineListQuery}
          bikerListQuery={mapData.bikerListQuery}
          zavListQuery={mapData.zavListQuery}
          offlineCountdown={offlineCountdown.online}
          startOfflineTimer={startOfflineTimer}
          handleLocateUser={handleLocateUser}
          onToggleOfflineOnline={() => {
            const next = !showOfflineOnline;
            setShowOfflineOnline(next);
            if (next) {
              startOfflineTimer();
              queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
            } else {
              setOfflineCountdown({ online: 0 });
            }
          }}
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          selectedUserDetail={selectedUserDetail}
          selectedUserProposals={selectedUserProposals}
          detailLoading={detailLoading}
          setSelectedMapPhoto={setSelectedMapPhoto}
          myOrganizedEvents={mapData.myOrganizedEventsQuery.data ?? []}
          targetUserEventIds={mapData.targetUserEventIdsQuery.data ?? []}
          activeSosRequests={mapData.activeSosQuery.data ?? []}
          showSosDetail={showSosDetail}
          setShowSosDetail={setShowSosDetail}
          acceptSosMutation={mapData.acceptSosMutation}
          selectedEgg={selectedEgg}
          setSelectedEgg={setSelectedEgg}
          collectEggMutation={mapData.collectEggMutation}
          selectedMapPhoto={selectedMapPhoto}
          showHomeMessage={showHomeMessage}
          setShowHomeMessage={setShowHomeMessage}
          homeMessageText={mapData.homeMessageQuery.data?.text || ""}
          showAreaModal={showAreaModal}
          setShowAreaModal={setShowAreaModal}
          selectedCountries={selectedCountries}
          toggleCountryInModal={toggleCountryInModal}
          toggleContinentInModal={toggleContinentInModal}
          saveCountries={saveCountries}
          user={user}
          t={t}
        />
      </ScrollView>

      {/* Single always-mounted InteractiveMap — animated between compact and fullscreen */}
      {compactLayout && (
        <Animated.View
          style={[
            styles.animatedMap,
            {
              top: animTop,
              left: animLeft,
              width: animWidth,
              height: animHeight,
              borderRadius: animRadius,
              zIndex: mapFullscreen ? 100 : 2,
            },
            !mapFullscreen && fixedPositionEnabled && styles.animatedMapFixedBorder,
          ]}
        >
          <InteractiveMap
            ref={mapRef}
            users={filteredUsers}
            workshops={filteredWorkshops}
            businesses={filteredBusinesses}
            easterEggs={filteredEasterEggs}
            activeSosRequests={filteredSosRequests}
            isAvailable={isAvailable}
            ghostMode={isGhostMode}
            searchRadiusKm={mySearchRadius ?? 0}
            filterBiker={filterBiker}
            filterZavorrina={filterZavorrina}
            filterClubs={filterClubs}
            filterEvents={filterEvents}
            onToggleFilterBiker={toggleFilterBiker}
            onToggleFilterZavorrina={toggleFilterZavorrina}
            onToggleFilterClubs={toggleFilterClubs}
            onToggleFilterEvents={toggleFilterEvents}
            motoTags={motoTags}
            onChangeMotoTags={setMotoTags}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapUser index signature mismatch between map-types and useHomeMapState
            onUserPress={(u) => { handleUserPress(u as any); }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- EasterEgg vs MapEasterEgg index signature mismatch
            onEasterEggPress={(e) => { handleEasterEggPress(e as any); }}
            onBusinessPress={(b) => {
              setMapFullscreen(false);
              router.push(`/business/${b.id}` as never);
            }}
            onEventPress={(id) => {
              setMapFullscreen(false);
              router.push({ pathname: "/evento/[id]" as const, params: { id } });
            }}
            onClubPress={(club: ClubMapPin) => {
              setMapFullscreen(false);
              router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } });
            }}
            onProposeClubLocation={(club: ClubMapPin) => {
              setMapFullscreen(false);
              router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } });
            }}
            onReady={() => setMapReady(true)}
            currentUserId={user?.id ?? null}
            realMeMarker={realMeMarker}
            fakeMeMarker={fakeMeMarker}
            fixedPositionEnabled={fixedPositionEnabled}
            onFixedPositionBadgePress={() => router.navigate("/ready" as never)}
            showEventPins={mapFullscreen}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clubPins={(mapData.clubPinsQuery.data ?? []) as any}
            initialCenterOverride={smallMapInitialCenter}
            onRegionChangeComplete={(center) => setLastSmallMapCenter(center)}
            filterBarTopOffset={mapFullscreen ? insets.top : undefined}
            gpsFollowupEnabled={true}
            showHazardReportButton={mapFullscreen}
            filterVessels={filterVessels} onToggleFilterVessels={toggleFilterVessels} aisEnabled={aisEnabled}
          />

          {/* Compact mode: transparent tap target to expand + expand icon.
              Leave a 50px gap at the bottom so the fixed-position badge (bottom:16)
              remains tappable even when the map is in compact (non-fullscreen) state. */}
          {!mapFullscreen && (
            <>
              <Pressable
                style={[StyleSheet.absoluteFill, { bottom: fixedPositionEnabled ? 50 : 0 }]}
                onPress={() => setMapFullscreen(true)}
              />
              <View style={styles.expandHint} pointerEvents="none">
                <Ionicons name="expand" size={16} color={Colors.text} />
              </View>
            </>
          )}
        </Animated.View>
      )}

      {/* Fullscreen overlay UI — rendered above map, only interactive when fullscreen */}
      <HomeFullscreenMap
        mapFullscreen={mapFullscreen}
        setMapFullscreen={setMapFullscreen}
        insets={insets}
        setShowAreaModal={setShowAreaModal}
        areaLabel={areaLabel}
        searchText={searchText}
        handleSearch={handleSearch}
        setSearchText={setSearchText}
        setSearchResults={setSearchResults}
        setShowSearchResults={setShowSearchResults}
        searchResults={searchResults}
        searchLoading={searchLoading}
        showSearchResults={showSearchResults}
        handleSearchResultPress={handleSearchResultPress}
        onlineCount={onlineCount}
        bikerCount={bikerCount}
        zavCount={zavCount}
        currentUserFullId={user?.id}
        getUserIcon={getUserIcon}
        getUserColor={getUserColor}
        getUserTypeLabel={(u) => getUserTypeLabel(u, t)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  animatedMap: {
    position: "absolute",
    overflow: "hidden",
  },
  expandHint: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    padding: 6,
    borderRadius: 8,
  },
  animatedMapFixedBorder: {
    borderWidth: 2,
    borderColor: "rgba(255,111,0,0.92)",
  },
});

// ── Boot guard ───────────────────────────────────────────────────────────────
// MapScreenContent chiama useHomeMapState() che monta decine di hook pesanti.
// Se montati prima che l'auth sia pronto (user=null), certi useEffect causano
// "Maximum update depth exceeded". Il wrapper impedisce il mount finché
// user è disponibile; il TabLayout (isLoading || !user guard) gestisce la
// schermata vuota e il redirect verso login.
export default function MapScreen() {
  const { isLoading } = useAuth();
  if (isLoading) return <View style={{ flex: 1 }} />;
  return <MapScreenContent />;
}
