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
