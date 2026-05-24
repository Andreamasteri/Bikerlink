import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getUserColor, getUserTypeLabel, getUserIcon } from "@/lib/mapUserUtils";
import MapSearchBar from "@/components/map/MapSearchBar";
import AdBanner from "@/components/map/AdBanner";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeStatsRow } from "@/components/home/HomeStatsRow";
import { HomeMapSection } from "@/components/home/HomeMapSection";
import { HomeModalsAndSheets } from "@/components/home/HomeModalsAndSheets";
import { HomeFullscreenMap } from "@/components/home/HomeFullscreenMap";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useHomeMapState } from "@/hooks/home/useHomeMapState";
import styles from "@/components/map/mapScreenStyles";

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    user,
    authLoading,
    t,
    mapFullscreen,
    setMapFullscreen,
    mapFullscreenReady,
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
    fullscreenMapRef,
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
    toggleFilterBiker,
    toggleFilterZavorrina,
    toggleFilterClubs,
    toggleFilterEvents,
    locationLoading,
    mapData,
    saveCountries,
    toggleCountryInModal,
    toggleContinentInModal,
    areaLabel,
    startOfflineTimer,
    isAvailable,
    isGhostMode,
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
    handleFullscreenMapReady,
  } = useHomeMapState();

  if (authLoading || locationLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>{t("map.loadingMap")}</Text>
      </View>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ad shape from API
  const currentAd = myAds[adIndex % myAds.length] as any;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 16 }}
    >
      {/* Header */}
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
      <HomeMapSection
        mapFullscreen={mapFullscreen}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ref type from InteractiveMap
        mapRef={mapRef as any}
        usersWithSelf={usersWithSelf}
        workshops={mapData.workshopsQuery.data ?? []}
        activeSosRequests={mapData.activeSosQuery.data ?? []}
        isAvailable={isAvailable}
        ghostMode={isGhostMode}
        mySearchRadius={mySearchRadius}
        filterBiker={filterBiker}
        filterZavorrina={filterZavorrina}
        toggleFilterBiker={toggleFilterBiker}
        toggleFilterZavorrina={toggleFilterZavorrina}
        handleUserPress={handleUserPress}
        handleEasterEggPress={handleEasterEggPress}
        onEventPress={(id) => router.push({ pathname: "/evento/[id]" as const, params: { id } })}
        setMapReady={setMapReady}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user.id from auth context
        userId={user?.id as any}
        realMeMarker={realMeMarker}
        fakeMeMarker={fakeMeMarker}
        setLastSmallMapCenter={setLastSmallMapCenter}
        smallMapInitialCenter={smallMapInitialCenter}
        setMapFullscreen={setMapFullscreen}
      />

      {/* Stats Row */}
      <HomeStatsRow
        onlineCount={onlineCount}
        bikerCount={bikerCount}
        zavCount={zavCount}
        onShowOnlineList={() => setShowOnlineList(true)}
        onShowBikerList={() => setShowBikerList(true)}
        onShowZavorrinaList={() => setShowZavorrinaList(true)}
        t={t}
      />

      {/* Ad Banner */}
      {mapData.adsGloballyEnabled && myAds.length > 0 && currentAd && (
        <AdBanner key={currentAd.id} ad={currentAd} onPress={handleAdClick} />
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

      {/* Fullscreen Map */}
      <HomeFullscreenMap
        mapFullscreen={mapFullscreen}
        setMapFullscreen={setMapFullscreen}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fullscreen map ref
        fullscreenMapRef={fullscreenMapRef as any}
        usersWithSelf={usersWithSelf}
        workshopsQuery={mapData.workshopsQuery}
        easterEggsQuery={mapData.easterEggsQuery}
        activeSosQuery={mapData.activeSosQuery}
        isAvailable={isAvailable}
        isGhostMode={isGhostMode}
        mySearchRadius={mySearchRadius}
        filterBiker={filterBiker}
        filterZavorrina={filterZavorrina}
        filterClubs={filterClubs}
        filterEvents={filterEvents}
        toggleFilterBiker={toggleFilterBiker}
        toggleFilterZavorrina={toggleFilterZavorrina}
        toggleFilterClubs={toggleFilterClubs}
        toggleFilterEvents={toggleFilterEvents}
        handleUserPress={handleUserPress}
        handleEasterEggPress={handleEasterEggPress}
        realMeMarker={realMeMarker}
        fakeMeMarker={fakeMeMarker}
        clubPinsQuery={mapData.clubPinsQuery}
        lastSmallMapCenter={lastSmallMapCenter}
        insets={insets}
        setShowAreaModal={setShowAreaModal}
        areaLabel={areaLabel}
        onMapReady={handleFullscreenMapReady}
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
        mapFullscreenReady={mapFullscreenReady}
        getUserIcon={getUserIcon}
        getUserColor={getUserColor}
        getUserTypeLabel={(u) => getUserTypeLabel(u, t)}
      />
    </ScrollView>
  );
}
