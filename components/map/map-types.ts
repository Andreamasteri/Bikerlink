export interface MapUser {
  id: string;
  nickname: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  country?: string | null;
  region?: string | null;
  latitude: number;
  longitude: number;
  currentSpeedKph?: number | null;
  speedProfile?: "city" | "highway" | "mountain" | null;
}

export interface MapWorkshop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isSynecoPartner: boolean;
}

export interface MapEasterEgg {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface MapSosRequest {
  id: string;
  requesterNickname?: string;
  reason: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface EventMapPin {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  eventDate: string;
}

export interface ClubMapPin {
  id: string;
  name: string;
  clubType: string;
  logoUrl: string | null;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  isFictitious: boolean;
  memberCount: number;
  currentUserIsMember?: boolean;
}

export interface InteractiveMapProps {
  users?: MapUser[];
  workshops?: MapWorkshop[];
  easterEggs?: MapEasterEgg[];
  activeSosRequests?: MapSosRequest[];
  isAvailable: boolean;
  ghostMode?: boolean;
  searchRadiusKm?: number | null;
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterBarTopOffset?: number;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onUserPress?: (user: MapUser) => void;
  onEasterEggPress?: (egg: MapEasterEgg) => void;
  onReady?: () => void;
  currentUserId?: string | null;
  realMeMarker?: { latitude: number; longitude: number } | null;
  fakeMeMarker?: { latitude: number; longitude: number } | null;
  onEventPress?: (eventId: string) => void;
  showEventPins?: boolean;
  clubPins?: ClubMapPin[];
  filterClubs?: boolean;
  onToggleFilterClubs?: () => void;
  filterEvents?: boolean;
  onToggleFilterEvents?: () => void;
  motoTags?: string[];
  onChangeMotoTags?: (next: string[]) => void;
  onClubPress?: (club: ClubMapPin) => void;
  onProposeClubLocation?: (club: ClubMapPin) => void;
  initialCenterOverride?: { latitude: number; longitude: number } | null;
  onRegionChangeComplete?: (center: { latitude: number; longitude: number }) => void;
  gpsFollowupEnabled?: boolean;
  showHazardReportButton?: boolean;
  onFatalError?: () => void;
  fixedPositionEnabled?: boolean;
}

export interface InteractiveMapHandle {
  focusOnCoordinate: (coords: { latitude: number; longitude: number; userId?: string }) => void;
  invalidateSize: () => void;
}
