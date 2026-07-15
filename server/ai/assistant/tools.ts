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
 *   - getThinkCentreStatus — stato dei servizi self-hosted (Ollama, GH, Photon)
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
import { routes, events, plannedRoutes, aiToolEvents } from "@shared/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { webSearch } from "./web-search";
import { askHorus, askQuebracho, askAres } from "./inter-agent";
import { appendHorusNote } from "./horus-memory";
import { reviewTaskPlan, type ReviewAgent } from "./task-review";

const PROBE_TIMEOUT_MS = 5_000;

// Task #11 — Hardening backend AI Assistant (b) streaming.
//
// Le tool sopra (getWeather, getThinkCentreStatus) hanno già un timeout
// esplicito sulla singola fetch (PROBE_TIMEOUT_MS via AbortController), ma
// getBikerStats/getNearbyEvents/getUserPlannedRoutes interrogano il DB SENZA
// alcun timeout: una query lenta (DB managed sotto carico, vedi
// db-managed-slowness) blocca l'intero turno finché il pool non risponde o il
// tunnel Cloudflare non scade da solo. `withToolTimeout` mette un tetto
// UNIFORME sull'attesa per QUALSIASI tool (anche quelli già temporizzati
// internamente, come rete di sicurezza in più): se scatta, la query DB
// sottostante continua a girare in background (drizzle non supporta la
// cancellazione lato server), ma l'agente non resta bloccato ad aspettarla e
// il modello riceve un errore esplicito invece di un turno appeso.
export const TOOL_EXECUTION_TIMEOUT_MS = 8_000;

// Un singolo risultato-tool grande (es. molti percorsi pianificati con
// waypoint estesi) fa crescere il prefill reinserito nel prompt
// dell'iterazione successiva, con lo stesso rischio di superare il tetto di
// tempo del tunnel documentato nel repo gemello BikerBlog (vedi
// `capToolResult`/MAX_TOOL_RESULT_CHARS là). Cappiamo quindi anche qui la
// dimensione JSON di OGNI risultato-tool prima che rientri nel contesto del
// modello, avvisando esplicitamente il modello del taglio.
export const MAX_TOOL_RESULT_CHARS = 4_000;

class ToolTimeoutError extends Error {}

/** Roster/persona che ha invocato il tool — vedi aiToolEvents in shared/db/ai-assistant.ts. */
type ToolRoster = "bowie" | "horus";

// Task #41 — Il modello vedeva già l'errore/troncamento nel singolo turno, ma
// l'evento era invisibile all'admin al di fuori di quella conversazione. Qui
// lo persistiamo come contatore-per-combinazione (tool, roster, tipo evento),
// fire-and-forget e best-effort: un fallimento di questo insert non deve MAI
// far fallire il tool-call che lo ha generato.
function recordToolEvent(name: string, roster: ToolRoster, eventType: "timeout" | "truncated", message: string): void {
  db.insert(aiToolEvents)
    .values({ toolName: name, roster, eventType, lastMessage: message.slice(0, 300) })
    .onConflictDoUpdate({
      target: [aiToolEvents.toolName, aiToolEvents.roster, aiToolEvents.eventType],
      set: {
        occurrences: sql`${aiToolEvents.occurrences} + 1`,
        lastMessage: message.slice(0, 300),
        lastOccurredAt: new Date(),
      },
    })
    .catch((err) => {
      console.warn(`[tools] recordToolEvent(${name}/${roster}/${eventType}) fallito (ignorato):`, (err as Error).message);
    });
}

async function withToolTimeout<T>(
  name: string,
  roster: ToolRoster,
  run: () => Promise<T>,
): Promise<T | { error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new ToolTimeoutError(`Tool "${name}" ha superato il timeout di ${TOOL_EXECUTION_TIMEOUT_MS}ms`)),
        TOOL_EXECUTION_TIMEOUT_MS,
      );
      run().then(resolve, reject);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ToolTimeoutError) recordToolEvent(name, roster, "timeout", message);
    return { error: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Tronca il risultato di un tool se il suo JSON supera MAX_TOOL_RESULT_CHARS,
 * avvisando esplicitamente il modello del taglio (non silenzioso) e
 * registrando l'evento per l'admin (Task #41). */
function capToolResult(name: string, roster: ToolRoster, result: unknown): unknown {
  let json: string;
  try {
    json = JSON.stringify(result) ?? "";
  } catch {
    return result;
  }
  if (json.length <= MAX_TOOL_RESULT_CHARS) return result;
  recordToolEvent(name, roster, "truncated", `risultato di ${json.length} caratteri troncato a ${MAX_TOOL_RESULT_CHARS}`);
  return {
    truncated: true,
    tool: name,
    note:
      `Risultato di "${name}" troncato a ${MAX_TOOL_RESULT_CHARS} caratteri per restare sotto il ` +
      "limite di tempo del turno: richiama il tool con parametri più mirati se ti serve il resto.",
    preview: json.slice(0, MAX_TOOL_RESULT_CHARS),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExecute = (...args: any[]) => any;

/** Avvolge `execute` di un tool AI SDK con timeout uniforme + cap del
 * risultato, senza toccarne description/inputSchema. Applicato a ogni tool
 * esportato più sotto, sia per il tool-calling nativo (streamText) sia per il
 * percorso manuale di recovery in agent.ts (tryParseTextualToolCall). Il
 * tipo del tool AI SDK è volutamente ristretto a `unknown` in ingresso/uscita
 * qui: la firma esatta di `execute` (input/output/context generici) varia per
 * ogni tool e viene già ri-castata dai chiamanti (streamText con `as never`,
 * agent.ts con `execute?: (...args) => Promise<unknown>`), quindi non serve
 * — anzi comprometterebbe — che `guardTool` la preservi esattamente.
 *
 * Task #41 — `roster` è un'etichetta STATICA (non deriva dal turno): Bowie e
 * Horus avvolgono separatamente la stessa definizione di tool (vedi
 * OLLAMA_TOOLS/HORUS_TOOLS sotto), quindi basta per attribuire gli eventi
 * timeout/troncamento alla persona che li ha effettivamente generati. */
function guardTool<T extends { execute?: AnyExecute }>(name: string, roster: ToolRoster, toolDef: T): T {
  const original = toolDef.execute as AnyExecute | undefined;
  if (!original) return toolDef;
  const guarded: AnyExecute = async (...args: unknown[]) => {
    const raw = await withToolTimeout(name, roster, () => Promise.resolve(original(...args)));
    return capToolResult(name, roster, raw);
  };
  return { ...toolDef, execute: guarded } as T;
}

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
  description: "Verifica lo stato dei servizi self-hosted sul ThinkCentre di casa (Ollama, GraphHopper routing, Photon geocoding).",
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
    const photonUrl = process.env.PHOTON_URL;
    const photonToken = process.env.PHOTON_TOKEN;

    const probes: Promise<void>[] = [];
    if (ollamaUrl) probes.push(probe("ollama", `${ollamaUrl}/api/tags`, { ...cfAccessHeaders(), ...(ollamaToken ? { "X-Ollama-Token": ollamaToken } : {}) }));
    if (ghUrl) probes.push(probe("graphhopper", `${ghUrl}/health`, { ...cfAccessHeaders(), ...(ghToken ? { "X-GH-Token": ghToken } : {}) }));
    // Photon non ha /status: una query di geocoding minima ("Roma") verifica il servizio.
    if (photonUrl) probes.push(probe("photon", `${photonUrl.replace(/\/$/, "")}/api/?q=Roma&limit=1&lang=default`, { ...cfAccessHeaders(), ...(photonToken ? { "X-Photon-Token": photonToken } : {}) }));

    await Promise.all(probes);

    return {
      timestamp: new Date().toISOString(),
      services: results,
      configured: {
        ollama: Boolean(ollamaUrl),
        graphhopper: Boolean(ghUrl),
        photon: Boolean(photonUrl),
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
  getWeather: guardTool("getWeather", "bowie", getWeatherTool),
  getBikerStats: guardTool("getBikerStats", "bowie", getBikerStatsTool),
  getThinkCentreStatus: guardTool("getThinkCentreStatus", "bowie", getThinkCentreStatusTool),
  getNearbyEvents: guardTool("getNearbyEvents", "bowie", getNearbyEventsTool),
  getUserPlannedRoutes: guardTool("getUserPlannedRoutes", "bowie", getUserPlannedRoutesTool),
  webSearch: guardTool("webSearch", "bowie", webSearchTool),
} as const;

// Task #5326 — Sottoinsieme di tool per Horus (specialista percorsi): niente
// stats/percorsi utente specifici di Bowie, ma sì meteo + ricerca web (utile
// per condizioni strada/eventi che influenzano un itinerario). Task #41 — le
// istanze guardate sono SEPARATE da quelle di OLLAMA_TOOLS (stessa definizione
// di tool, wrapper diverso) proprio per etichettare gli eventi con roster="horus".
export const HORUS_TOOLS = {
  getWeather: guardTool("getWeather", "horus", getWeatherTool),
  getThinkCentreStatus: guardTool("getThinkCentreStatus", "horus", getThinkCentreStatusTool),
  getNearbyEvents: guardTool("getNearbyEvents", "horus", getNearbyEventsTool),
  webSearch: guardTool("webSearch", "horus", webSearchTool),
} as const;

// ── Task #50 — Tool inter-agente + memoria Horus + revisione piani ──────────────
//
// A differenza dei tool sopra, questi NON passano da `guardTool`: consultano
// altre AI (Horus/Quebracho/Ares) o l'agente di revisione, che girano su modelli
// pesanti self-hosted con latenze di decine di secondi. Il tetto di 8s di
// `guardTool` li ucciderebbe sempre. Ognuno gestisce il proprio timeout
// internamente (nei client) e ritorna un testo di cortesia in caso di errore,
// così il modello non riceve mai uno stack trace.

export interface InterAgentToolContext {
  /** Sessione admin: sblocca call_ares (solo admin). */
  isAdmin: boolean;
  /** History conversazionale per comporre il contesto tecnico di Ares. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Ultimo messaggio utente del turno. */
  latestMessage: string;
  signal?: AbortSignal;
}

/** Compone un prompt tecnico per Ares dal contesto conversazionale quando l'admin
 *  non specifica un focus esplicito (BikerLink non ha un "backlog di supervisione
 *  tecnica" formale: usiamo la conversazione corrente come voce di lavoro). */
function composeAresContext(history: Array<{ role: string; content: string }>, latestMessage: string): string {
  const recent = history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "Utente" : "Assistente"}: ${t.content}`)
    .join("\n");
  return [
    "Attivazione di Ares per supervisione tecnica sulla questione corrente.",
    recent ? `Contesto recente della conversazione:\n${recent}` : "",
    `Richiesta corrente: ${latestMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Costruisce i tre tool inter-agente disponibili SOLO quando la persona attiva è
 *  Bowie. `call_ares` è incluso solo in sessioni admin. */
export function buildBowieInterAgentTools(ctx: InterAgentToolContext): Record<string, unknown> {
  const tools: Record<string, unknown> = {
    call_horus: tool({
      description:
        "Consulta Horus, lo specialista di percorsi, itinerari e navigazione moto, per una domanda " +
        "specifica a metà conversazione. Ritorna la sua risposta perché tu la incorpori nella tua, " +
        "senza passargli la conversazione. Usalo quando l'utente chiede il parere di Horus o la " +
        "questione riguarda routing/itinerari/percorsi.",
      inputSchema: z.object({
        prompt: z.string().min(1).describe("La domanda da porre a Horus, chiara e autosufficiente."),
      }),
      execute: async (input: { prompt: string }) => {
        const r = await askHorus(input.prompt, { signal: ctx.signal });
        return { agent: "horus", ok: r.ok, response: r.text };
      },
    }),
    call_quebracho: tool({
      description:
        "Chiede un parere a Quebracho, il coordinatore/regista degli agenti AI, a metà conversazione. " +
        "Ritorna il suo punto di vista perché tu lo incorpori nella tua risposta. Usalo quando l'utente " +
        "chiede cosa ne pensa Quebracho o vuole coinvolgerlo.",
      inputSchema: z.object({
        message: z.string().min(1).describe("Il messaggio/domanda da inoltrare a Quebracho."),
      }),
      execute: async (input: { message: string }) => {
        const r = await askQuebracho(input.message, { signal: ctx.signal });
        return { agent: "quebracho", ok: r.ok, response: r.text };
      },
    }),
  };

  if (ctx.isAdmin) {
    tools.call_ares = tool({
      description:
        "Attiva Ares, l'AI di diagnostica/supervisione tecnica (solo admin), sulla questione tecnica " +
        "corrente. Ares analizza e propone, non applica mai modifiche. Ritorna la sua analisi perché tu " +
        "la incorpori. Usalo quando un admin chiede di chiamare/attivare Ares.",
      inputSchema: z.object({
        focus: z
          .string()
          .optional()
          .describe("Aspetto tecnico specifico su cui attivare Ares; se assente usa il contesto della conversazione."),
      }),
      execute: async (input: { focus?: string }) => {
        const prompt = input.focus?.trim() || composeAresContext(ctx.history, ctx.latestMessage);
        const r = await askAres(prompt, { signal: ctx.signal });
        return { agent: "ares", ok: r.ok, response: r.text };
      },
    });
  }

  return tools;
}

/** Tool `remember_note`: solo Horus può salvare note nella memoria persistente. */
export function buildRememberNoteTool(isAdmin: boolean): Record<string, unknown> {
  // Sicurezza: la memoria di Horus è GLOBALE (condivisa fra tutte le sessioni) e
  // viene iniettata nel system prompt di ogni futura conversazione con Horus. Per
  // evitare che un utente qualsiasi avveleni il contesto di altri o vi immetta
  // PII/segreti, la SCRITTURA è riservata alle sessioni admin. In sessioni
  // non-admin il tool non viene nemmeno esposto al modello.
  if (!isAdmin) return {};
  return {
    remember_note: tool({
      description:
        "Salva una nota nella tua memoria persistente (solo Horus, solo admin). La nota verrà " +
        "ricordata automaticamente in tutte le conversazioni future. Usalo quando l'admin ti chiede " +
        "di ricordare, memorizzare, annotare o tenere a mente qualcosa. Non salvare mai segreti o PII.",
      inputSchema: z.object({
        note: z.string().min(1).describe("La nota da ricordare, chiara e autosufficiente."),
      }),
      execute: async (input: { note: string }) => {
        try {
          const saved = await appendHorusNote(input.note, new Date().toISOString());
          return { ok: true, saved };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    }),
  };
}

/** Tool `review_task_plan`: disponibile a TUTTE le persone. Instrada la revisione
 *  all'agente della persona invocante. Non modifica mai nulla.
 *  `allowFileRead` (default false lato tool) abilita la lettura di un `filePath`
 *  dal disco: va concesso SOLO in sessioni admin per evitare la divulgazione di
 *  file arbitrari. In sessioni non-admin resta ammessa solo la revisione di un
 *  testo incollato (`content`). */
export function buildReviewTaskPlanTool(
  agent: ReviewAgent,
  opts: { signal?: AbortSignal; allowFileRead?: boolean } = {},
): Record<string, unknown> {
  const { signal, allowFileRead = false } = opts;
  return {
    review_task_plan: tool({
      description:
        "Revisiona un task plan (dato un percorso file o un testo) PRIMA che venga eseguito e produci " +
        "una review strutturata in italiano (Scope, Rischi, Step mancanti, Contraddizioni, Out of scope, " +
        "Giudizio finale). Segnala i file citati nel piano che non esistono nel repository. Non modifica " +
        "mai nulla: propone soltanto. Usalo quando ti si chiede di revisionare/rivedere/analizzare un " +
        "piano o un task plan.",
      inputSchema: z.object({
        filePath: z
          .string()
          .optional()
          .describe("Percorso del file di task plan da revisionare (es. .local/tasks/task-50.md)."),
        content: z.string().optional().describe("Testo del task plan, alternativo a filePath."),
      }),
      execute: async (input: { filePath?: string; content?: string }) => {
        const r = await reviewTaskPlan({
          filePath: input.filePath,
          content: input.content,
          agent,
          signal,
          allowFileRead,
        });
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, review: r.review, missingFiles: r.missingFiles ?? [] };
      },
    }),
  };
}
