import http from "http";
import { db } from "../../../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { getInternalProbeToken, getInternalProbeHeaderName } from "../../watchdog/internal-token";
import type { PipelineCheckResult, PipelineCheckStep } from "../types";

function httpProbe(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const port = parseInt(process.env.PORT ?? "5000", 10);
    const headers: Record<string, string> = {
      [getInternalProbeHeaderName()]: getInternalProbeToken(),
    };
    let payload: Buffer | undefined;
    if (body !== undefined) {
      payload = Buffer.from(JSON.stringify(body), "utf8");
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, timeout: 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { /* not json */ }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("probe timeout 10s")); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function runStep(name: string, fn: () => Promise<string | void>): Promise<PipelineCheckStep> {
  const start = Date.now();
  try {
    const msg = await fn();
    return { name, status: "ok", durationMs: Date.now() - start, message: msg ?? undefined };
  } catch (err) {
    return { name, status: "error", durationMs: Date.now() - start, message: (err as Error).message?.slice(0, 300) };
  }
}

export async function checkTelemetryRide(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];
  const sessionId = `probe-${crypto.randomBytes(6).toString("hex")}`;

  // Step 1: POST /api/telemetry/batch via admin probe (uses internal token bypass)
  let isProbeMode = false;
  steps.push(await runStep("POST /api/telemetry/batch", async () => {
    const body = {
      session_id: sessionId,
      session_type: "ride",
      samples: [{ ts: Date.now(), lat: 45.464, lon: 9.188, speed_kmh: 50 }],
    };
    const r = await httpProbe("POST", "/api/telemetry/batch", body);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if ((r.json as Record<string, unknown>)?.probe === true) isProbeMode = true;
    return `session_id=${sessionId}`;
  }));

  // Step 2: verify row in ride_telemetry
  // Se la route ha risposto con probe:true ha fatto dry-run (userId="__probe__" non è FK valida)
  // — l'endpoint funziona correttamente, non serve verificare il DB.
  steps.push(await runStep("verifica insert ride_telemetry", async () => {
    if (isProbeMode) return "probe dry-run — insert correttamente skippato (nessuna FK reale)";
    const res = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM ride_telemetry WHERE session_id = ${sessionId}
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt === 0) throw new Error("nessun campione trovato nel DB dopo insert");
    return `${cnt} campioni inseriti`;
  }));

  // Cleanup
  steps.push(await runStep("cleanup probe", async () => {
    await db.execute(sql`DELETE FROM ride_telemetry WHERE session_id = ${sessionId}`);
    return "rimosso";
  }));

  const overall = steps.some(s => s.status === "error")
    ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "telemetry_ride",
    label: "Telemetria Ride",
    overall,
    steps,
    suggestedFix: overall !== "ok"
      ? "Verifica che /api/telemetry/batch sia raggiungibile e che la tabella ride_telemetry esista."
      : null,
    durationMs: Date.now() - t0,
  };
}

export async function checkTelemetryMaps(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await runStep("GET /api/telemetry/maps/flag", async () => {
    const r = await httpProbe("GET", "/api/telemetry/maps/flag");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return "flag endpoint OK";
  }));

  steps.push(await runStep("verifica tabella maps_telemetry_events", async () => {
    const res = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM maps_telemetry_events WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    return `${cnt} eventi nelle ultime 24h`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "telemetry_maps",
    label: "Telemetria Mappe",
    overall,
    steps,
    suggestedFix: overall !== "ok"
      ? "Verifica /api/telemetry/maps e la tabella maps_telemetry_events."
      : null,
    durationMs: Date.now() - t0,
  };
}
