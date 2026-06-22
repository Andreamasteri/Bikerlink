import { Router, type Request, type Response } from "express";
import { ROUTING_AREAS, routingAreaUrl } from "@shared/routing-areas";
import { SELF_HOSTED_BASE_URL, isSelfHosted } from "../../../graphhopper-client";

const AREA_HEALTH_TIMEOUT_MS = 2_000;
const AREA_STATE_RING_SIZE = 50;

interface AreaStateEvent {
  areaCode: string;
  nome: string;
  timestamp: string;
  from: boolean;
  to: boolean;
  latencyMs: number | null;
}

const areaLastState = new Map<string, boolean>();
const areaStateEvents = new Map<string, AreaStateEvent[]>();

function recordAreaStateChange(
  code: string,
  nome: string,
  from: boolean,
  to: boolean,
  latencyMs: number | null,
): void {
  const event: AreaStateEvent = {
    areaCode: code,
    nome,
    timestamp: new Date().toISOString(),
    from,
    to,
    latencyMs,
  };
  const existing = areaStateEvents.get(code) ?? [];
  existing.unshift(event);
  if (existing.length > AREA_STATE_RING_SIZE) existing.length = AREA_STATE_RING_SIZE;
  areaStateEvents.set(code, existing);
}

function getAllAreaEvents(limit = 50): AreaStateEvent[] {
  const all: AreaStateEvent[] = [];
  for (const events of areaStateEvents.values()) {
    all.push(...events);
  }
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return all.slice(0, limit);
}

interface AreaHealthResult {
  code: string;
  nome: string;
  tier: "core" | "on-demand";
  portaInterna: number;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  probedAt: string;
  buildDate: string | null;
  profiles: string[] | null;
}

async function probeAreaHealth(
  code: string,
  nome: string,
  tier: "core" | "on-demand",
  portaInterna: number,
  url: string,
  token: string,
): Promise<AreaHealthResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AREA_HEALTH_TIMEOUT_MS);
  const started = Date.now();
  const probedAt = new Date().toISOString();
  try {
    const headers: Record<string, string> = {};
    if (token) headers["X-GH-Token"] = token;
    const resp = await fetch(url, { method: "GET", signal: ctrl.signal, headers });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const ok = resp.status >= 200 && resp.status < 300;

    let buildDate: string | null = null;
    let profiles: string[] | null = null;
    if (ok) {
      try {
        const body = await resp.json() as Record<string, unknown>;
        if (typeof body.build_date === "string") buildDate = body.build_date;
        if (Array.isArray(body.profiles)) profiles = body.profiles as string[];
      } catch { /* noop */ }
    }

    return { code, nome, tier, portaInterna, ok, latencyMs, statusCode: resp.status, error: null, probedAt, buildDate, profiles };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error
      ? (err.name === "AbortError" ? "timeout (2s)" : err.message.slice(0, 120))
      : String(err).slice(0, 120);
    return { code, nome, tier, portaInterna, ok: false, latencyMs: null, statusCode: null, error: msg, probedAt, buildDate: null, profiles: null };
  }
}

export const areaRouter = Router();

areaRouter.get("/health", async (_req: Request, res: Response) => {
  if (!isSelfHosted || !SELF_HOSTED_BASE_URL) {
    return res.json({
      available: false,
      reason: "not_self_hosted",
      areas: ROUTING_AREAS.map((a) => ({
        code: a.codice,
        nome: a.nome,
        tier: a.tier,
        portaInterna: a.portaInterna,
        ok: false,
        latencyMs: null,
        statusCode: null,
        error: "ThinkCentre non configurato",
        probedAt: new Date().toISOString(),
      })),
      events: getAllAreaEvents(),
    });
  }

  const token = process.env.GRAPHHOPPER_TOKEN ?? "";
  const probes = await Promise.all(
    ROUTING_AREAS.map((a) =>
      probeAreaHealth(
        a.codice,
        a.nome,
        a.tier,
        a.portaInterna,
        `${routingAreaUrl(a, SELF_HOSTED_BASE_URL)}/health`,
        token,
      ),
    ),
  );

  for (const probe of probes) {
    const prev = areaLastState.get(probe.code);
    if (prev !== undefined && prev !== probe.ok) {
      recordAreaStateChange(probe.code, probe.nome, prev, probe.ok, probe.latencyMs);
    }
    areaLastState.set(probe.code, probe.ok);
  }

  const healthyCount = probes.filter((p) => p.ok).length;
  return res.json({
    available: true,
    healthyCount,
    totalCount: probes.length,
    areas: probes,
    events: getAllAreaEvents(),
  });
});
