export interface NavigationStep {
  sign: number;
  text: string;
  distance: number;
  time: number;
  interval: [number, number];
  streetName?: string;
}

export interface PlannedRoute {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  waypoints: Array<{ lat: number; lng: number; name?: string }>;
  polyline?: string | null;
  navigationSteps?: NavigationStep[] | null;
}

export interface TechnicalCheckpoint {
  id: string;
  type: "turn_warning";
  latitude: number;
  longitude: number;
  distanceBeforeM: number;
  maxSpeedKmh: number;
  sign: number;
  instruction: string;
  audioKey: string;
}

export interface PlannedRouteMetadata {
  technicalCheckpoints?: TechnicalCheckpoint[];
  departureAt?: string | null;
  returnAt?: string | null;
  [key: string]: unknown;
}
