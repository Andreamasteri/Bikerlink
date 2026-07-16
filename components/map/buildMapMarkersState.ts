import type {
  MapUser, MapWorkshop, MapBusiness, MapEasterEgg, MapSosRequest, ClubMapPin, EventMapPin,
} from "@/components/map/map-types";
import { capMarkers } from "@/lib/maps/cap-markers";

interface BuildMapMarkersStateParams {
  mapsEnabled: boolean;
  activeTileUrl: string;
  activeTileMaxZoom: number;
  userLocation: { latitude: number; longitude: number } | null;
  isAvailable: boolean;
  searchRadiusKm?: number | null;
  filteredUsers: MapUser[];
  workshops: MapWorkshop[];
  businesses: MapBusiness[];
  eventPins: EventMapPin[];
  showEventPins: boolean;
  filterEvents: boolean;
  clubPins: ClubMapPin[];
  filterClubs: boolean;
  easterEggs: MapEasterEgg[];
  activeSosRequests: MapSosRequest[];
  realMeMarker?: { latitude: number; longitude: number } | null;
  fakeMeMarker?: { latitude: number; longitude: number } | null;
  currentUserId?: string | null;
  fixedPositionEnabled?: boolean;
}

const FALLBACK_TILE_URL = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const FALLBACK_MAX_ZOOM = 19;

export function buildMapMarkersState(p: BuildMapMarkersStateParams): string {
  const tileUrl = p.mapsEnabled ? p.activeTileUrl : FALLBACK_TILE_URL;
  const tileMaxZoom = p.mapsEnabled ? p.activeTileMaxZoom : FALLBACK_MAX_ZOOM;
  const loc = p.userLocation;
  const center = loc ? { lat: loc.latitude, lng: loc.longitude } : null;

  const rawMarkers = {
    users: p.filteredUsers.map((u) => ({
      id: u.id,
      lat: u.latitude,
      lng: u.longitude,
      userType: u.userType,
      sex: u.sex ?? null,
      nickname: u.nickname,
      country: u.country ?? null,
      isCurrentUser: p.currentUserId != null && u.id === p.currentUserId,
      currentSpeedKph: u.currentSpeedKph ?? null,
      speedProfile: u.speedProfile ?? null,
    })),
    workshops: p.workshops.map((ws) => ({
      id: ws.id,
      lat: ws.latitude,
      lng: ws.longitude,
      name: ws.name,
    })),
    businesses: p.businesses.map((b) => ({
      id: b.id,
      lat: b.latitude,
      lng: b.longitude,
      name: b.name,
      type: b.type,
    })),
    events:
      p.showEventPins && p.filterEvents
        ? p.eventPins.map((ep) => ({ id: ep.id, lat: ep.latitude, lng: ep.longitude, title: ep.title }))
        : [],
    clubs: p.filterClubs
      ? p.clubPins.map((c) => ({
          id: c.id,
          lat: c.latitude,
          lng: c.longitude,
          name: c.name,
          isFictitious: c.isFictitious,
          memberCount: c.memberCount,
        }))
      : [],
    easterEggs: p.easterEggs.map((e) => ({
      id: e.id,
      lat: e.latitude,
      lng: e.longitude,
      name: e.name,
    })),
    sos: p.activeSosRequests.map((s) => ({
      id: s.id,
      lat: s.latitude,
      lng: s.longitude,
      radiusKm: s.radiusKm,
      reason: s.reason,
      nickname: s.requesterNickname ?? null,
    })),
  };

  // Cap total markers before bridge injection to prevent Android OOM
  // (HashMap.resize crash when the RN bridge serialises a large JS object).
  const markers = capMarkers(rawMarkers, center);

  const state = {
    tileUrl,
    tileMaxZoom,
    userLocation: center,
    searchRadius:
      p.isAvailable && loc && p.searchRadiusKm && p.searchRadiusKm > 0
        ? { lat: loc.latitude, lng: loc.longitude, km: p.searchRadiusKm }
        : null,
    markers: {
      ...markers,
      realMe: p.realMeMarker ? { lat: p.realMeMarker.latitude, lng: p.realMeMarker.longitude } : null,
      fakeMe: p.fakeMeMarker ? { lat: p.fakeMeMarker.latitude, lng: p.fakeMeMarker.longitude } : null,
    },
    fixedPositionEnabled: p.fixedPositionEnabled ?? false,
  };
  return JSON.stringify(JSON.stringify(state));
}
