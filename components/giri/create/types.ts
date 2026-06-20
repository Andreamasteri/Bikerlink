export type Style = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";
export type DrivingProfile = "geometric" | "real" | "my_style";
// Profilo veicolo: "moto" usa il routing moto standard; "auto_curvy" instrada
// a Valhalla con costing auto panoramico. Asse distinto da Style/DrivingProfile.
export type VehicleProfile = "moto" | "auto_curvy";
export type RoutingProfile = "auto_curvy";
export type Mode = "ai" | "ai-preview" | "manual";
export type CompassDir = "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";

export interface Waypoint { lat: number; lng: number; name: string; }
export interface GeoResult { name: string; lat: number; lng: number; }
export type TelemetryCoverageReason =
  | "not_applicable"
  | "no_community_data"
  | "route_coverage_insufficient"
  | "user_km_below_target"
  | "engine_unsupported"
  | "applied";

export interface TelemetryCoverage {
  reason: TelemetryCoverageReason;
  coveredSegments: number;
  requiredSegments: number;
  routeSegments: number;
  userKm: number | null;
  targetKm: number | null;
}

export interface RouteResult {
  encoded?: string | null;
  rawPoints?: Array<{ lat: number; lng: number }> | null;
  distanceKm: number;
  durationMinutes: number;
  bikerScore: number;
  approximate?: boolean;
  warning?: string | null;
  telemetryCoverage?: TelemetryCoverage | null;
  weatherWarning?: string | null;
  navigationSteps?: Array<{ sign: number; text: string; distance: number; interval: [number, number]; streetName?: string }> | null;
  elevationProfile?: Array<{ distanceKm: number; altitudeM: number }> | null;
  elevationGainM?: number | null;
  altitudeMinM?: number | null;
  altitudeMaxM?: number | null;
}

export interface WeatherWaypoint {
  lat: number; lng: number; name: string;
  tempNow: number | null; precipProb: number; weatherCode: number;
  weatherDesc: string; isSuitable: boolean;
}

export interface UserMotorcycle { id: string; brand: string; model: string; year?: number | null; ridingStyle?: string | null; isDefault?: boolean; }

export interface AiPreviewItem {
  role: "start" | "waypoint" | "end";
  name: string;
  editedName: string;
  lat: number;
  lng: number;
  geocoding: boolean;
  resolved: boolean;
}

export interface AiPoiStop {
  near: string;
  query: string;
  category: string;
}

export interface AiPreviewState {
  title: string;
  style: Style;
  isRoundTrip: boolean;
  roundTripDirection: CompassDir | null;
  isMultiDay: boolean;
  daysEstimate: number;
  avoidHighways: boolean;
  items: AiPreviewItem[];
  poiStops?: AiPoiStop[] | null;
}

export const STYLE_LEVELS: { key: Style; label: string; shortLabel: string }[] = [
  { key: "direct", label: "Diretto", shortLabel: "Diretto" },
  { key: "fast", label: "Veloce", shortLabel: "Veloce" },
  { key: "balanced", label: "Bilanciato", shortLabel: "Bilanc." },
  { key: "curvy", label: "Curvy", shortLabel: "Curvy" },
  { key: "extra_curvy", label: "Extra Curvy", shortLabel: "Extra +" },
];

export const COMPASS_DIRECTIONS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "NE", deg: 45 },
  { label: "E", deg: 90 },
  { label: "SE", deg: 135 },
  { label: "S", deg: 180 },
  { label: "SO", deg: 225 },
  { label: "O", deg: 270 },
  { label: "NO", deg: 315 },
];

export interface PoiResult {
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
}

export interface ResolvedPoiStop {
  near: string;
  query: string;
  category: string;
  options: PoiResult[];
  selectedOption: PoiResult | null;
}

export interface MyStyleProfile {
  totalKm: number;
  targetKm: number;
  hasReachedThreshold: boolean;
  progressPct: number;
  avgLeanAngle: number | null;
  avgGforce: number | null;
  sampleCount: number;
}
