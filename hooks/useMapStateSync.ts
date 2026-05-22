import { useCallback, useEffect } from "react";
import { buildMapMarkersState } from "@/components/map/buildMapMarkersState";
import type {
  MapUser, MapWorkshop, MapEasterEgg, MapSosRequest, ClubMapPin, EventMapPin,
} from "@/components/map/map-types";
import type { MapProvider } from "@/lib/map-tiles";

interface UseMapStateSyncParams {
  mapReady: boolean;
  inject: (js: string) => void;
  mapsEnabled: boolean;
  resolvedProvider: MapProvider;
  userLocation: { latitude: number; longitude: number } | null;
  isAvailable: boolean;
  searchRadiusKm?: number | null;
  filteredUsers: MapUser[];
  workshops: MapWorkshop[];
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
}

export function useMapStateSync({
  mapReady,
  inject,
  mapsEnabled,
  resolvedProvider,
  userLocation,
  isAvailable,
  searchRadiusKm,
  filteredUsers,
  workshops,
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
}: UseMapStateSyncParams): void {
  const buildAndPushState = useCallback(() => {
    if (!mapReady) return;
    const encoded = buildMapMarkersState({
      mapsEnabled, resolvedProvider, userLocation, isAvailable, searchRadiusKm,
      filteredUsers, workshops, eventPins, showEventPins, filterEvents,
      clubPins, filterClubs, easterEggs, activeSosRequests,
      realMeMarker, fakeMeMarker, currentUserId,
    });
    inject("window.leafletBridge && window.leafletBridge.updateState(" + encoded + ")");
  }, [
    mapReady, mapsEnabled, resolvedProvider, userLocation, isAvailable, searchRadiusKm,
    filteredUsers, workshops, eventPins, showEventPins, filterEvents,
    clubPins, filterClubs, easterEggs, activeSosRequests,
    realMeMarker, fakeMeMarker, currentUserId, inject,
  ]);

  useEffect(() => { buildAndPushState(); }, [buildAndPushState]);
}
