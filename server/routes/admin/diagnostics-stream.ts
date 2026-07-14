import { Router, type Request, type Response } from "express";
import {
  getPipelineStatusPayload,
  getHolesPayload,
  getWatchdogLogsPayload,
  getPoolHealthPayload,
  getHeartbeatPayload,
} from "../../ai/pipeline-monitor/stream-aggregators";
import { watchdogLogEmitter } from "../../ai/watchdog/log";
import { pipelineRunEmitter } from "../../ai/pipeline-monitor/runner";
import { storage } from "../../storage";
import { getUserIdFromCookieHeader } from "../../session-utils";

const router = Router();

function sseWrite(res: Response, event: string, data: unknown): boolean {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

// GET /api/admin/diagnostics/stream
// SSE stream: mantiene la connessione aperta e invia 5 tipi di eventi.
// Protetto da _requireAdmin nel parent router.
router.get("/diagnostics/stream", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const timers: ReturnType<typeof setInterval>[] = [];
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    for (const t of timers) clearInterval(t);
    watchdogLogEmitter.off("new-entry", onNewWatchdogLog);
    pipelineRunEmitter.off("run-complete", onPipelineRunComplete);
  };

  // Periodic re-authorization: close the stream if the session row has been
  // deleted (logout / displacement) OR if the user no longer holds the admin
  // role or has been suspended. Both checks run every 60 s.
  // Pseudo-users (watchdog / ADMIN_DIAGNOSTICS_TOKEN bypass) carry no real
  // session — skip revalidation for them.
  const realUserId: string | undefined = req.session?.userId;
  const cookieHeaderForAdmin = req.headers.cookie ?? "";
  if (realUserId && cookieHeaderForAdmin) {
    timers.push(setInterval(async () => {
      if (closed) return;
      try {
        // 1. Verify the session row still exists in the store.
        const sessionUserId = await getUserIdFromCookieHeader(cookieHeaderForAdmin);
        if (!sessionUserId || sessionUserId !== realUserId) {
          sseWrite(res, "auth-error", { message: "Session revoked." });
          cleanup();
          try { res.end(); } catch { /* noop */ }
          return;
        }
        // 2. Verify the user account still has admin privileges and is active.
        const user = await storage.getUser(realUserId);
        if (!user || user.role !== "admin" || user.status !== "active") {
          sseWrite(res, "auth-error", { message: "Privileges changed or account inactive." });
          cleanup();
          try { res.end(); } catch { /* noop */ }
        }
      } catch {
        // DB error: leave stream open rather than close on transient failure.
      }
    }, 60_000));
  }

  // Task #43 — `res.on("close")`, mai `req.on("close")`: su Node 20 +
  // express.json() la IncomingMessage emette "close" (one-shot) non appena il
  // middleware globale ha consumato la richiesta, ben prima che questo
  // handler arrivi qui — un listener agganciato dopo non scatterebbe mai sulla
  // vera disconnessione del client. Vedi .agents/memory/sse-abort-res-not-req.md.
  res.on("close", cleanup);

  // ── Emitter subscriptions (immediate push) ───────────────────────────────────

  const onNewWatchdogLog = () => {
    if (closed) return;
    getWatchdogLogsPayload().then((payload) => {
      if (!closed) sseWrite(res, "watchdog-log", payload);
    }).catch(() => { /* noop */ });
  };

  const onPipelineRunComplete = () => {
    if (closed) return;
    sseWrite(res, "pipeline-status", getPipelineStatusPayload());
  };

  watchdogLogEmitter.on("new-entry", onNewWatchdogLog);
  pipelineRunEmitter.on("run-complete", onPipelineRunComplete);

  // ── Initial burst ────────────────────────────────────────────────────────────
  try {
    const wdLogs = await getWatchdogLogsPayload();
    sseWrite(res, "pipeline-status", getPipelineStatusPayload());
    sseWrite(res, "holes", getHolesPayload());
    sseWrite(res, "watchdog-log", wdLogs);
    sseWrite(res, "pool-health", getPoolHealthPayload());
    sseWrite(res, "heartbeat", getHeartbeatPayload());
  } catch (err) {
    sseWrite(res, "error", { message: (err as Error).message });
  }

  // ── Periodic fallback intervals ───────────────────────────────────────────────

  // Pipeline status fallback — ogni 60s (il push immediato copre i run)
  timers.push(setInterval(() => {
    if (closed) return;
    sseWrite(res, "pipeline-status", getPipelineStatusPayload());
  }, 60_000));

  // Buchi attivi — ogni 30s (hole-detector scheduler gira ogni 5 min)
  timers.push(setInterval(() => {
    if (closed) return;
    sseWrite(res, "holes", getHolesPayload());
  }, 30_000));

  // Pool DB — ogni 15s
  timers.push(setInterval(() => {
    if (closed) return;
    sseWrite(res, "pool-health", getPoolHealthPayload());
  }, 15_000));

  // Heartbeat servizi — ogni 10s
  timers.push(setInterval(() => {
    if (closed) return;
    sseWrite(res, "heartbeat", getHeartbeatPayload());
  }, 10_000));

  // Keep-alive ping — ogni 25s
  timers.push(setInterval(() => {
    if (closed) { cleanup(); return; }
    try { res.write(": ping\n\n"); } catch { cleanup(); }
  }, 25_000));
});

export default router;
