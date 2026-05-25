import type { MapUser } from "@/components/InteractiveMap";

export type FullscreenMapOverlayProps = {
  visible: boolean;
  onClose: () => void;
  insetsTop: number;
  insetsBottom: number;
  onShowAreaModal: () => void;
  areaLabel: string;
  searchText: string;
  onSearch: (text: string) => void;
  onClearSearch: () => void;
  searchResults: MapUser[];
  searchLoading: boolean;
  showSearchResults: boolean;
  onSearchResultPress: (u: MapUser) => void;
  currentUserFullId: string | null | undefined;
  onlineCount: number;
  bikerCount: number;
  zavCount: number;
  getUserIcon: (u: MapUser) => "people" | "person" | "bicycle";
  getUserColor: (u: MapUser) => string;
  getUserTypeLabel: (u: MapUser) => string;
};

export type FullscreenMapModalProps = FullscreenMapOverlayProps;
