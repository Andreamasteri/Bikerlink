import React from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useT } from "@/lib/language-context";
import FullscreenMapModal from "@/components/map/FullscreenMapModal";

interface HomeFullscreenMapProps {
  mapFullscreen: boolean;
  setMapFullscreen: (val: boolean) => void;
  fullscreenMapRef: any;
  usersWithSelf: any[];
  workshopsQuery: any;
  easterEggsQuery: any;
  activeSosQuery: any;
  isAvailable: boolean;
  isGhostMode: boolean;
  mySearchRadius: number;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterClubs: boolean;
  filterEvents: boolean;
  toggleFilterBiker: () => void;
  toggleFilterZavorrina: () => void;
  toggleFilterClubs: () => void;
  toggleFilterEvents: () => void;
  handleUserPress: (user: any) => void;
  handleEasterEggPress: (egg: any) => void;
  realMeMarker: { latitude: number; longitude: number } | null;
  fakeMeMarker: { latitude: number; longitude: number } | null;
  clubPinsQuery: any;
  lastSmallMapCenter: { latitude: number; longitude: number } | null;
  insets: any;
  setShowAreaModal: (val: boolean) => void;
  areaLabel: string;
  searchText: string;
  handleSearch: (text: string) => void;
  setSearchText: (text: string) => void;
  setSearchResults: (results: any[]) => void;
  setShowSearchResults: (show: boolean) => void;
  searchResults: any[];
  searchLoading: boolean;
  showSearchResults: boolean;
  handleSearchResultPress: (u: any) => void;
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
  mapFullscreenReady: boolean;
  getUserIcon: any;
  getUserColor: any;
  getUserTypeLabel: any;
}

export const HomeFullscreenMap: React.FC<HomeFullscreenMapProps> = ({
  mapFullscreen,
  setMapFullscreen,
  fullscreenMapRef,
  usersWithSelf,
  workshopsQuery,
  easterEggsQuery,
  activeSosQuery,
  isAvailable,
  isGhostMode,
  mySearchRadius,
  filterBiker,
  filterZavorrina,
  filterClubs,
  filterEvents,
  toggleFilterBiker,
  toggleFilterZavorrina,
  toggleFilterClubs,
  toggleFilterEvents,
  handleUserPress,
  handleEasterEggPress,
  realMeMarker,
  fakeMeMarker,
  clubPinsQuery,
  lastSmallMapCenter,
  insets,
  setShowAreaModal,
  areaLabel,
  searchText,
  handleSearch,
  setSearchText,
  setSearchResults,
  setShowSearchResults,
  searchResults,
  searchLoading,
  showSearchResults,
  handleSearchResultPress,
  onlineCount,
  bikerCount,
  zavCount,
  mapFullscreenReady,
  getUserIcon,
  getUserColor,
  getUserTypeLabel,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const t = useT();

  return (
    <FullscreenMapModal
      visible={mapFullscreen}
      onClose={() => setMapFullscreen(false)}
      mapRef={fullscreenMapRef}
      users={usersWithSelf.filter(
        (u: any) => u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude)
      )}
      workshops={(workshopsQuery.data ?? []).filter(
        (w: any) => w.latitude != null && w.longitude != null && !isNaN(w.latitude) && !isNaN(w.longitude)
      )}
      easterEggs={(easterEggsQuery.data ?? []).filter(
        (e: any) => e.latitude != null && e.longitude != null && !isNaN(e.latitude) && !isNaN(e.longitude)
      )}
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
      onEventPress={(id) => {
        setMapFullscreen(false);
        router.push({ pathname: "/evento/[id]" as const, params: { id } });
      }}
      onClubPress={(club) => {
        setMapFullscreen(false);
        router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } });
      }}
      onProposeClubLocation={(club) => {
        setMapFullscreen(false);
        router.push({ pathname: "/motoclub/[id]" as const, params: { id: club.id } });
      }}
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
      onClearSearch={() => {
        setSearchText("");
        setSearchResults([]);
        setShowSearchResults(false);
      }}
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
  );
};
