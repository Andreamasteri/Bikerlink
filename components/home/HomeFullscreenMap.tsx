import React from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import FullscreenMapModal from "@/components/map/FullscreenMapModal";

interface MapItem {
  id?: string | number;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
}
interface QueryLike {
  data?: unknown;
  isLoading?: boolean;
}
interface HomeFullscreenMapProps {
  mapFullscreen: boolean;
  setMapFullscreen: (val: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- map ref type varies
  fullscreenMapRef: React.RefObject<any>;
  usersWithSelf: MapItem[];
  workshopsQuery: QueryLike;
  easterEggsQuery: QueryLike;
  activeSosQuery: QueryLike;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts MapUser from useHomeMapState
  handleUserPress: (user: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts EasterEgg from useHomeMapState
  handleEasterEggPress: (egg: any) => void;
  realMeMarker: { latitude: number; longitude: number } | null;
  fakeMeMarker: { latitude: number; longitude: number } | null;
  clubPinsQuery: QueryLike;
  lastSmallMapCenter: { latitude: number; longitude: number } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- insets type from react-native-safe-area-context
  insets: any;
  setShowAreaModal: (val: boolean) => void;
  areaLabel: string;
  searchText: string;
  handleSearch: (text: string) => void;
  setSearchText: (text: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- search result shape varies
  setSearchResults: (results: any[]) => void;
  setShowSearchResults: (show: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- search result shape varies
  searchResults: any[];
  searchLoading: boolean;
  showSearchResults: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- result shape from API
  handleSearchResultPress: (u: any) => void;
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
  mapFullscreenReady: boolean;
  onMapReady?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user icon/color helpers accept any user shape
  getUserIcon: (user: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user icon/color helpers accept any user shape
  getUserColor: (user: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user icon/color helpers accept any user shape
  getUserTypeLabel: (user: any) => string;
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

  return (
    <FullscreenMapModal
      visible={mapFullscreen}
      onClose={() => setMapFullscreen(false)}
      mapRef={fullscreenMapRef}
      users={usersWithSelf.filter(
        (u) => u.latitude != null && u.longitude != null && !isNaN(u.latitude as number) && !isNaN(u.longitude as number)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapItem matches MapUser at runtime
      ) as any}
      workshops={((workshopsQuery.data as MapItem[]) ?? []).filter(
        (w) => w.latitude != null && w.longitude != null && !isNaN(w.latitude as number) && !isNaN(w.longitude as number)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapItem matches MapWorkshop at runtime
      ) as any}
      easterEggs={((easterEggsQuery.data as MapItem[]) ?? []).filter(
        (e) => e.latitude != null && e.longitude != null && !isNaN(e.latitude as number) && !isNaN(e.longitude as number)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapItem matches MapEasterEgg at runtime
      ) as any}
      activeSosRequests={((activeSosQuery.data as MapItem[]) ?? []).filter(
        (s) => s.latitude != null && s.longitude != null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapItem matches MapSosRequest at runtime
      ) as any}
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- clubPins from API
      clubPins={(clubPinsQuery.data ?? []) as any}
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getUserIcon returns string matching union
      getUserIcon={getUserIcon as any}
      getUserColor={getUserColor}
      getUserTypeLabel={getUserTypeLabel}
      showHazardReportButton={true}
    />
  );
};
