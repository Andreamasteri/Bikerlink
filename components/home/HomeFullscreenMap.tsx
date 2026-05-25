import React from "react";
import FullscreenMapModal from "@/components/map/FullscreenMapModal";
import type { MapUser } from "@/components/InteractiveMap";

interface HomeFullscreenMapProps {
  mapFullscreen: boolean;
  setMapFullscreen: (val: boolean) => void;
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
  currentUserFullId: string | null | undefined;
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
  currentUserFullId,
  getUserIcon,
  getUserColor,
  getUserTypeLabel,
}) => {
  return (
    <FullscreenMapModal
      visible={mapFullscreen}
      onClose={() => setMapFullscreen(false)}
      insetsTop={insets.top}
      insetsBottom={insets.bottom}
      onShowAreaModal={() => setShowAreaModal(true)}
      areaLabel={areaLabel}
      searchText={searchText}
      onSearch={handleSearch}
      onClearSearch={() => {
        setSearchText("");
        setSearchResults([]);
        setShowSearchResults(false);
      }}
      searchResults={searchResults as MapUser[]}
      searchLoading={searchLoading}
      showSearchResults={showSearchResults}
      onSearchResultPress={handleSearchResultPress}
      currentUserFullId={currentUserFullId}
      onlineCount={onlineCount}
      bikerCount={bikerCount}
      zavCount={zavCount}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getUserIcon returns string matching union
      getUserIcon={getUserIcon as any}
      getUserColor={getUserColor}
      getUserTypeLabel={getUserTypeLabel}
    />
  );
};
