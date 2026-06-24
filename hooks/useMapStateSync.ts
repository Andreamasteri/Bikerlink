import { useCallback, useEffect } from "react";
import { buildMapMarkersState } from "@/components/map/buildMapMarkersState";
import type {
  MapUser, MapWorkshop, MapBusiness, MapEasterEgg, MapSosRequest, ClubMapPin, EventMapPin,
} from "@/components/map/map-types";

interface UseMapStateSyncParams {
  mapReady: boolean;
  mapReadyEpoch?: number;
  inject: (js: string) => void;
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

export function useMapStateSync({
  mapReady,
  mapReadyEpoch: _mapReadyEpoch,
  inject,
  mapsEnabled,
  activeTileUrl,
  activeTileMaxZoom,
  userLocation,
  isAvailable,
  searchRadiusKm,
  filteredUsers,
  workshops,
  businesses,
  eventPins,
  showEventPins,
  filterEvents,
  clubPins,
  filterClubs,
  easterEggs,
  activeSosRequests,
  realMeMarker,
  fakeMeMarker,
  currentUserId,
  fixedPositionEnabled,
}: UseMapStateSyncParams): void {
  const buildAndPushState = useCallback(() => {
    if (!mapReady) return;
    const encoded = buildMapMarkersState({
      mapsEnabled, activeTileUrl, activeTileMaxZoom, userLocation, isAvailable, searchRadiusKm,
      filteredUsers, workshops, businesses, eventPins, showEventPins, filterEvents,
      clubPins, filterClubs, easterEggs, activeSosRequests,
      realMeMarker, fakeMeMarker, currentUserId, fixedPositionEnabled,
    });
    inject("window.leafletBridge && window.leafletBridge.updateState(" + encoded + ")");
  }, [
    mapReady, mapsEnabled, activeTileUrl, activeTileMaxZoom, userLocation, isAvailable, searchRadiusKm,
    filteredUsers, workshops, businesses, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests,
    realMeMarker, fakeMeMarker, currentUserId, fixedPositionEnabled, inject,
  ]);

  useEffect(() => { buildAndPushState(); }, [buildAndPushState]);
}
