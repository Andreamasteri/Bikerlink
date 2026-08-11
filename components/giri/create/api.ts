import { getApiUrl } from "@/lib/query-client";
import { Ionicons } from "@expo/vector-icons";
import { AiKeyMissingError, isAiKeyMissingResponse } from "@/lib/ai-errors";
import { Waypoint, Style, DrivingProfile, RoutingProfile, RouteResult, WeatherWaypoint } from "./types";

// Re-export per i consumatori che importano da questo modulo.
export { AiKeyMissingError } from "@/lib/ai-errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- geocode results from API
export async function geocode(q: string): Promise<any[]> {
  const url = new URL("/api/planned-routes/geocode", getApiUrl());
  url.searchParams.set("q", q);
  const resp = await fetch(url.toString(), { credentials: "include" });
  if (!resp.ok) return [];
  return resp.json();
}

export async function calcRoute(
  waypoints: Waypoint[],
  style: Style,
  drivingProfile: DrivingProfile,
  avoidHighways: boolean,
  avoidTolls: boolean,
  avoidFerries: boolean,
  avoidUnpaved: boolean,
  avoidWeather: boolean,
  roundTripHours?: number,
  isRoundTrip?: boolean,
  headingDeg?: number | null,
  language?: string,
  routingProfile?: RoutingProfile,
  geocodingOk?: boolean,
): Promise<RouteResult> {
  const url = new URL("/api/planned-routes/calculate", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather,
      roundTripHours, isRoundTrip, language,
      ...(headingDeg !== null && headingDeg !== undefined ? { headingDeg } : {}),
      ...(routingProfile ? { routingProfile } : {}),
      ...(geocodingOk === false ? { geocodingOk: false } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message ?? "Calcolo percorso fallito");
  }
  return resp.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI parse result shape from API
export async function parseAI(prompt: string): Promise<any> {
  const url = new URL("/api/planned-routes/ai-parse", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      clientDate: new Date().toISOString().slice(0, 10),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    if (isAiKeyMissingResponse(resp.status, body.message)) {
      throw new AiKeyMissingError();
    }
    throw new Error(body.message ?? "Servizio AI non disponibile");
  }
  return resp.json();
}

export function clientFallbackAiParse(prompt: string) {
  const lower = prompt.toLowerCase();
  return {
    title: "Giro in moto",
    startLocation: "", endLocation: "", waypoints: [] as string[],
    style: lower.includes("veloce") || lower.includes("autostrada") ? "fast"
      : lower.includes("curve") || lower.includes("curvy") || lower.includes("panoramic") ? "curvy" : "balanced",
    isRoundTrip: lower.includes("ritorno") || lower.includes("andata e ritorno"),
    isMultiDay: lower.includes("giorni") || lower.includes("settimana") || lower.includes("weekend"),
    daysEstimate: lower.includes("settimana") ? 7 : lower.includes("weekend") ? 2 : 1,
    maxHoursPerDay: 6,
    avoidHighways: lower.includes("senza autostrada") || lower.includes("evit"),
    notes: prompt,
  };
}

export async function fetchWeatherPreview(waypoints: Waypoint[]): Promise<WeatherWaypoint[]> {
  const url = new URL("/api/planned-routes/weather", getApiUrl());
  const resp = await fetch(url.toString(), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints: waypoints.filter((w) => w.lat !== 0 || w.lng !== 0),
      departureTime: new Date(Date.now() + 3600_000).toISOString(),
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.waypoints ?? []).filter(Boolean);
}

export function weatherIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0) return "sunny-outline";
  if (code <= 3) return "partly-sunny-outline";
  if (code <= 59) return "rainy-outline";
  if (code <= 79) return "snow-outline";
  if (code <= 99) return "thunderstorm-outline";
  return "cloud-outline";
}
