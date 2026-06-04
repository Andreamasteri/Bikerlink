import { haversineKm } from "../../geo";

export function weatherCodeToDesc(code: number): string {
  if (code === 0) return "Sereno";
  if (code <= 3) return "Parzialmente nuvoloso";
  if (code <= 9) return "Nebbia";
  if (code <= 19) return "Pioggia leggera";
  if (code <= 29) return "Temporale";
  if (code <= 39) return "Neve leggera";
  if (code <= 49) return "Nebbia densa";
  if (code <= 59) return "Pioggerella";
  if (code <= 69) return "Pioggia";
  if (code <= 79) return "Neve";
  if (code <= 84) return "Rovesci";
  if (code <= 99) return "Temporale";
  return "Sconosciuto";
}

export function isSuitableForRiding(code: number, windSpeedKmh: number): boolean {
  if (code >= 20 && code <= 99) return false;
  if (windSpeedKmh > 60) return false;
  return true;
}

type HourlyDaily = {
  temperature_2m?: number[];
  precipitation_probability?: number[];
  wind_speed_10m?: number[];
  weathercode?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_sum?: number[];
  wind_speed_10m_max?: number[];
};

export interface WeatherSample {
  lat: number;
  lng: number;
  name: string;
  etaIso: string;
  etaOffsetHours: number;
  tempMax: number | null;
  tempMin: number | null;
  tempNow: number | null;
  precipitation: number;
  windSpeed: number | null;
  precipProb: number;
  weatherCode: number;
  weatherDesc: string;
  isSuitable: boolean;
}

export async function fetchWeatherForWaypoints(
  waypoints: Array<{ lat: number; lng: number; name?: string }>,
  departure: Date,
  avgSpeedKmh: number = 70,
): Promise<Array<WeatherSample | null>> {
  const results: Array<WeatherSample | null> = [];

  const cumulativeKm: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const cur = waypoints[i];
    cumulativeKm.push(cumulativeKm[i - 1] + haversineKm(prev.lat, prev.lng, cur.lat, cur.lng));
  }

  for (let wi = 0; wi < Math.min(waypoints.length, 10); wi++) {
    const wp = waypoints[wi];
    if (!wp.lat || !wp.lng) { results.push(null); continue; }

    const travelHours = cumulativeKm[wi] / avgSpeedKmh;
    const etaMs = departure.getTime() + travelHours * 3600_000;
    const eta = new Date(etaMs);
    const dateStr = eta.toISOString().split("T")[0];
    const hour = eta.getHours();

    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(wp.lat));
      url.searchParams.set("longitude", String(wp.lng));
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weathercode");
      url.searchParams.set("hourly", "temperature_2m,precipitation_probability,wind_speed_10m,weathercode");
      url.searchParams.set("timezone", "Europe/Rome");
      url.searchParams.set("start_date", dateStr);
      url.searchParams.set("end_date", dateStr);

      const resp = await fetch(url.toString());
      if (!resp.ok) { results.push(null); continue; }
      const data = await resp.json() as Record<string, HourlyDaily | undefined>;
      const hourly = data.hourly ?? {};
      const daily = data.daily ?? {};
      const clampedHour = Math.min(hour, (hourly.temperature_2m?.length ?? 1) - 1);

      results.push({
        lat: wp.lat, lng: wp.lng, name: wp.name ?? "",
        etaIso: eta.toISOString(),
        etaOffsetHours: Math.round(travelHours * 10) / 10,
        tempMax: daily.temperature_2m_max?.[0] ?? null,
        tempMin: daily.temperature_2m_min?.[0] ?? null,
        tempNow: hourly.temperature_2m?.[clampedHour] ?? null,
        precipitation: daily.precipitation_sum?.[0] ?? 0,
        windSpeed: hourly.wind_speed_10m?.[clampedHour] ?? null,
        precipProb: hourly.precipitation_probability?.[clampedHour] ?? 0,
        weatherCode: hourly.weathercode?.[clampedHour] ?? 0,
        weatherDesc: weatherCodeToDesc(hourly.weathercode?.[clampedHour] ?? 0),
        isSuitable: isSuitableForRiding(hourly.weathercode?.[clampedHour] ?? 0, hourly.wind_speed_10m?.[clampedHour] ?? 0),
      });
    } catch { results.push(null); }
  }
  return results;
}

/**
 * Campiona punti distribuiti uniformemente lungo la geometria di un percorso.
 * `coords` è una lista di coordinate GeoJSON [lng, lat, (ele)] come restituite
 * da GraphHopper con points_encoded=false.
 */
export function samplePointsAlongPath(
  coords: number[][] | undefined,
  maxSamples: number = 8,
): Array<{ lat: number; lng: number; name?: string }> {
  if (!coords || coords.length === 0) return [];
  const n = Math.min(maxSamples, coords.length);
  if (n <= 1) {
    const c = coords[0];
    return [{ lat: c[1], lng: c[0] }];
  }
  const step = (coords.length - 1) / (n - 1);
  const out: Array<{ lat: number; lng: number; name?: string }> = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round(i * step);
    const c = coords[idx];
    if (c && typeof c[0] === "number" && typeof c[1] === "number") {
      out.push({ lat: c[1], lng: c[0] });
    }
  }
  return out;
}

/**
 * Costruisce le aree GraphHopper (custom_model) da evitare attorno ai punti con
 * maltempo, più le regole di priorità che le azzerano. Ogni area è un quadrato
 * di lato ~2*radiusKm centrato sul punto avverso.
 */
export function buildWeatherAvoidAreas(
  points: Array<{ lat: number; lng: number }>,
  radiusKm: number = 12,
): { areas: Record<string, unknown>; priority: Array<{ if: string; multiply_by: number }> } {
  const features = points.map((p, i) => {
    const dLat = radiusKm / 111.32;
    const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(p.lat * Math.PI / 180)));
    return {
      type: "Feature",
      id: `storm_${i}`,
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [p.lng - dLng, p.lat - dLat],
          [p.lng + dLng, p.lat - dLat],
          [p.lng + dLng, p.lat + dLat],
          [p.lng - dLng, p.lat + dLat],
          [p.lng - dLng, p.lat - dLat],
        ]],
      },
    };
  });
  const priority = points.map((_, i) => ({ if: `in_storm_${i}`, multiply_by: 0.0 }));
  return {
    areas: { type: "FeatureCollection", features },
    priority,
  };
}
