export type {
  MapUser,
  MapWorkshop,
  MapEasterEgg,
  MapSosRequest,
  EventMapPin,
  ClubMapPin,
  InteractiveMapProps,
  InteractiveMapHandle,
} from "@/components/map/map-types";

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}

export interface RouteMapProps {
  waypoints: RouteWaypoint[];
  height?: number;
  typeColors?: Record<string, string>;
  showMarkers?: boolean;
  trackPoints?: Array<{ lat: number; lng: number; speedKmh?: number | null }>;
  onFatalError?: () => void;
}

export interface MiniMapProps {
  latitude: number;
  longitude: number;
  height?: number;
  onFatalError?: () => void;
}

export interface PickerWaypoint {
  lat: number;
  lng: number;
  name: string;
  waypointType: string;
}

export interface PickerMapProps {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  selectedCoord?: { lat: number; lng: number } | null;
  existingWaypoints?: PickerWaypoint[];
  onCoordPicked: (coord: { latitude: number; longitude: number }) => void;
}

export interface TrackingMapProps {
  points: Array<{ latitude: number; longitude: number }>;
  currentLocation: { latitude: number; longitude: number } | null;
  onFatalError?: () => void;
}
