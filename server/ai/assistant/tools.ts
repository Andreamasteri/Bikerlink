/**
 * Tool Calling Server-Side per Ollama — Task #3017
 *
 * Definisce tool Vercel AI SDK per l'assistente BikerLink.
 * Usati SOLO quando il provider è Ollama (con stopWhen: stepCountIs(3)).
 * I provider cloud non ricevono questi tool.
 *
 * Tool disponibili (5):
 *   - getWeather           — meteo corrente da OpenMeteo (free, no key)
 *   - getBikerStats        — statistiche aggregate del biker dal DB
 *   - getThinkCentreStatus — stato dei servizi self-hosted (Ollama, GH, Nominatim)
 *   - getNearbyEvents      — eventi/raduni attivi nel DB entro un raggio
 *   - getUserPlannedRoutes — percorsi moto pianificati dell'utente (Task #3090)
 *
 * NOTA: usa `inputSchema` + type parameter espliciti su tool<INPUT,OUTPUT>()
 * per risolvere correttamente gli overload del SDK (ai v6).
 */

import { tool } from "ai";
import { z } from "zod";
import { db } from "../../db";
import { cfAccessHeaders } from "../../lib/cf-access";
import { routes, events, plannedRoutes } from "@shared/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { webSearch } from "./web-search";

const PROBE_TIMEOUT_MS = 5_000;

// ── Schemas ───────────────────────────────────────────────────────────────────

const weatherSchema = z.object({
  lat: z.number().min(-90).max(90).describe("Latitudine della posizione"),
  lon: z.number().min(-180).max(180).describe("Longitudine della posizione"),
});

const bikerStatsSchema = z.object({
  userId: z.string().describe("ID dell'utente BikerLink"),
});

const emptySchema = z.object({});

const nearbyEventsSchema = z.object({
  lat: z.number().min(-90).max(90).describe("Latitudine dell'utente"),
  lon: z.number().min(-180).max(180).describe("Longitudine dell'utente"),
  radiusKm: z.number().min(1).max(500).default(100).describe("Raggio di ricerca in km"),
});

type WeatherInput = z.infer<typeof weatherSchema>;
type BikerStatsInput = z.infer<typeof bikerStatsSchema>;
type EmptyInput = z.infer<typeof emptySchema>;
type NearbyEventsInput = z.infer<typeof nearbyEventsSchema>;

// ── Tool: getWeather ──────────────────────────────────────────────────────────

export const getWeatherTool = tool({
  description: "Restituisce le condizioni meteo correnti per una posizione geografica. Usa OpenMeteo (no API key).",
  inputSchema: weatherSchema,
  execute: async (input: WeatherInput) => {
    const { lat, lon } = input;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation,weathercode&timezone=auto`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { error: `OpenMeteo HTTP ${res.status}` };
      const data = await res.json() as {
        current?: {
          temperature_2m?: number;
          wind_speed_10m?: number;
          precipitation?: number;
          weathercode?: number;
        };
      };
      const c = data.current ?? {};
      return {
        temperature_c: c.temperature_2m ?? null,
        wind_speed_kmh: c.wind_speed_10m ?? null,
        precipitation_mm: c.precipitation ?? null,
        weathercode: c.weathercode ?? null,
        description: describeWeatherCode(c.weathercode ?? 0),
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  },
});

function describeWeatherCode(code: number): string {
  if (code === 0) return "sereno";
  if (code <= 3) return "parzialmente nuvoloso";
  if (code <= 49) return "nebbia/foschia";
  if (code <= 69) return "pioggia";
  if (code <= 79) return "neve";
  if (code <= 82) return "rovesci";
  if (code <= 99) return "temporale";
  return "condizioni variabili";
}

// ── Tool: getBikerStats ───────────────────────────────────────────────────────

export const getBikerStatsTool = tool({
  description: "Restituisce statistiche aggregate di un biker (giri completati, km totali, media km/giro). Usa user_id dell'utente.",
  inputSchema: bikerStatsSchema,
  execute: async (input: BikerStatsInput) => {
    const { userId } = input;
    try {
      const [result] = await db
        .select({
          totalRoutes: sql<number>`count(*)::int`,
          totalKm: sql<number>`coalesce(sum(total_distance_km), 0)::float`,
          avgKm: sql<number>`coalesce(avg(total_distance_km), 0)::float`,
          lastRouteAt: sql<string | null>`max(stopped_at)::text`,
        })
        .from(routes)
        .where(and(eq(routes.userId, userId), eq(routes.status, "active")));

      return {
        totalRoutes: result?.totalRoutes ?? 0,
        totalKm: Math.round((result?.totalKm ?? 0) * 10) / 10,
        avgKm: Math.round((result?.avgKm ?? 0) * 10) / 10,
        lastRouteAt: result?.lastRouteAt ?? null,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  },
});

// ── Tool: getThinkCentreStatus ────────────────────────────────────────────────

export const getThinkCentreStatusTool = tool({
  description: "Verifica lo stato dei servizi self-hosted sul ThinkCentre di casa (Ollama, GraphHopper routing, Nominatim geocoding).",
  inputSchema: emptySchema,
  execute: async (_input: EmptyInput) => {
    const results: Record<string, { ok: boolean; latencyMs: number | null; error?: string }> = {};

    const probe = async (name: string, url: string, headers?: Record<string, string>) => {
      const start = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal, headers });
        clearTimeout(timer);
        results[name] = { ok: res.ok, latencyMs: Date.now() - start };
      } catch (err) {
        results[name] = { ok: false, latencyMs: Date.now() - start, error: (err as Error).message.slice(0, 80) };
      }
    };

    const ollamaUrl = process.env.BOWIE_OLLAMA_URL?.trim();
    const ollamaToken = process.env.BOWIE_OLLAMA_TOKEN;
    const ghUrl = process.env.GRAPHHOPPER_URL;
    const ghToken = process.env.GRAPHHOPPER_TOKEN;
    const nominatimUrl = process.env.NOMINATIM_URL;

    const probes: Promise<void>[] = [];
    if (ollamaUrl) probes.push(probe("ollama", `${ollamaUrl}/api/tags`, { ...cfAccessHeaders(), ...(ollamaToken ? { "X-Ollama-Token": ollamaToken } : {}) }));
    if (ghUrl) probes.push(probe("graphhopper", `${ghUrl}/health`, { ...cfAccessHeaders(), ...(ghToken ? { "X-GH-Token": ghToken } : {}) }));
    if (nominatimUrl) probes.push(probe("nominatim", `${nominatimUrl}/status`, cfAccessHeaders()));

    await Promise.all(probes);

    return {
      timestamp: new Date().toISOString(),
      services: results,
      configured: {
        ollama: Boolean(ollamaUrl),
        graphhopper: Boolean(ghUrl),
        nominatim: Boolean(nominatimUrl),
      },
    };
  },
});

// ── Tool: getNearbyEvents ─────────────────────────────────────────────────────

export const getNearbyEventsTool = tool({
  description: "Cerca eventi e raduni moto attivi nel DB entro un raggio dalla posizione. Ritorna titolo, data, distanza.",
  inputSchema: nearbyEventsSchema,
  execute: async (input: NearbyEventsInput) => {
    const { lat, lon, radiusKm } = input;
    try {
      const now = new Date();

      const rows = await db
        .select({
          id: events.id,
          title: events.title,
          eventType: events.eventType,
          locationName: events.locationName,
          eventDate: events.eventDate,
          latitude: events.latitude,
          longitude: events.longitude,
        })
        .from(events)
        .where(gte(events.eventDate, now))
        .limit(20);

      const nearby = rows
        .filter((r) => {
          if (r.latitude == null || r.longitude == null) return false;
          const dist = haversineKm(lat, lon, r.latitude, r.longitude);
          return dist <= radiusKm;
        })
        .map((r) => ({
          id: r.id,
          title: r.title,
          type: r.eventType,
          locationName: r.locationName,
          eventDate: r.eventDate?.toISOString().slice(0, 10) ?? null,
          distanceKm: r.latitude != null && r.longitude != null
            ? Math.round(haversineKm(lat, lon, r.latitude, r.longitude) * 10) / 10
            : null,
        }))
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
        .slice(0, 5);

      return { events: nearby, total: nearby.length, radiusKm };
    } catch (err) {
      return { error: (err as Error).message, events: [], total: 0 };
    }
  },
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Tool: getUserPlannedRoutes ─────────────────────────────────────────────────

const plannedRoutesSchema = z.object({
  userId: z.string().describe("ID dell'utente BikerLink"),
  limit: z.number().min(1).max(10).default(5).describe("Numero massimo di percorsi da restituire (default 5)"),
});
type PlannedRoutesInput = z.infer<typeof plannedRoutesSchema>;

export const getUserPlannedRoutesTool = tool({
  description: "Restituisce i percorsi moto pianificati recenti dell'utente. Utile per rispondere a domande su giri pianificati, soste, destinazioni o per aggiungere una tappa a un percorso esistente.",
  inputSchema: plannedRoutesSchema,
  execute: async (input: PlannedRoutesInput) => {
    const { userId, limit } = input;
    try {
      const rows = await db
        .select({
          id: plannedRoutes.id,
          title: plannedRoutes.title,
          description: plannedRoutes.description,
          style: plannedRoutes.style,
          distanceKm: plannedRoutes.distanceKm,
          durationMinutes: plannedRoutes.durationMinutes,
          waypoints: plannedRoutes.waypoints,
          visibility: plannedRoutes.visibility,
          createdAt: plannedRoutes.createdAt,
        })
        .from(plannedRoutes)
        .where(eq(plannedRoutes.userId, userId))
        .orderBy(desc(plannedRoutes.createdAt))
        .limit(limit);

      return {
        routes: rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description ?? null,
          style: r.style,
          distanceKm: r.distanceKm ?? 0,
          durationMinutes: r.durationMinutes ?? 0,
          waypointCount: Array.isArray(r.waypoints) ? r.waypoints.length : 0,
          firstWaypoint: Array.isArray(r.waypoints) && r.waypoints.length > 0 ? r.waypoints[0] : null,
          lastWaypoint: Array.isArray(r.waypoints) && r.waypoints.length > 1
            ? r.waypoints[r.waypoints.length - 1] : null,
          visibility: r.visibility,
          createdAt: (r.createdAt as Date | null)?.toISOString().slice(0, 10) ?? null,
        })),
        total: rows.length,
      };
    } catch (err) {
      return { error: (err as Error).message, routes: [], total: 0 };
    }
  },
});

// ── Tool: webSearch (Task #5326) ─────────────────────────────────────────────

const webSearchSchema = z.object({
  query: z.string().min(3).max(300).describe("Query di ricerca web (in italiano o inglese, concisa)"),
});
type WebSearchInput = z.infer<typeof webSearchSchema>;

export const webSearchTool = tool({
  description: "Cerca informazioni aggiornate sul web (metamotore SearXNG self-hosted) quando la domanda richiede dati non presenti nella knowledge base dell'app (es. novità, normative, prezzi esterni, notizie). Sola lettura, nessuna azione sull'app.",
  inputSchema: webSearchSchema,
  execute: async (input: WebSearchInput) => {
    const res = await webSearch(input.query);
    if (!res.available) return { error: res.error, results: [] };
    if (res.error) return { error: res.error, results: [] };
    return { answer: res.answer, results: res.results, query: res.query };
  },
});

// ── Exported tool set ─────────────────────────────────────────────────────────

export const OLLAMA_TOOLS = {
  getWeather: getWeatherTool,
  getBikerStats: getBikerStatsTool,
  getThinkCentreStatus: getThinkCentreStatusTool,
  getNearbyEvents: getNearbyEventsTool,
  getUserPlannedRoutes: getUserPlannedRoutesTool,
  webSearch: webSearchTool,
} as const;

// Task #5326 — Sottoinsieme di tool per Horus (specialista percorsi): niente
// stats/percorsi utente specifici di Bowie, ma sì meteo + ricerca web (utile
// per condizioni strada/eventi che influenzano un itinerario).
export const HORUS_TOOLS = {
  getWeather: getWeatherTool,
  getThinkCentreStatus: getThinkCentreStatusTool,
  getNearbyEvents: getNearbyEventsTool,
  webSearch: webSearchTool,
} as const;
