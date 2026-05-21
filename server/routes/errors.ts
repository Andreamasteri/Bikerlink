import express, { Router, type Request, type Response, type NextFunction } from "express";
import { sendEmail } from "../email";
import { storage } from "../storage";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";
import { gpsErrorSchema } from "@shared/schema";

const ADMIN_EMAIL = "bikerlinkapp@gmail.com";
const router = Router();

const MAX_STRING_LEN = 2000;
const MAX_STACK_LEN = 5000;

// SECURITY (Task #1450): Small per-route body parser replaces the global
// 10 MB parser for this endpoint. errorMessage is truncated to 2 KB and
// stackTrace to 5 KB downstream, so 16 KB gives comfortable headroom.
// The global parser is bypassed for /api/errors in server/index.ts so this
// parser is the only one that ever runs on these requests.
const errorsJson = express.json({ limit: "16kb" });

const ipHitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// SECURITY (Task #1450): Run the IP rate-limit check as middleware BEFORE
// the body parser so an over-limit attacker receives a 429 in O(1) — no
// multi-kilobyte JSON parse is triggered on their request.
function errorsRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getTrustedClientIp(req) ?? "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ message: "Troppe richieste" });
  }
  return next();
}

function truncate(s: unknown, max: number): string {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function buildErrorEmailHtml(payload: {
  errorMessage: string;
  stackTrace?: string | null;
  otaNumber: number | string;
  timestamp: string;
  platform: string;
  deviceName?: string | null;
  osVersion?: string | null;
  context?: string | null;
  userId?: string;
}): string {
  const esc = (s: unknown) => String(s ?? "—").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #e74c3c; margin: 0; font-size: 26px;">&#x26A0;&#xFE0F; BikerLink — Errore GPS</h1>
        <p style="color: #888; font-size: 13px; margin-top: 4px;">Log strutturato automatico</p>
      </div>
      <div style="background: #1a1a2e; border-radius: 12px; padding: 24px; color: #fff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="color:#aaa; padding: 6px 0; width: 140px;">Timestamp</td><td style="color:#fff;">${esc(payload.timestamp)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">OTA</td><td style="color:#FF6B35; font-weight: bold;">${esc(payload.otaNumber)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">Piattaforma</td><td style="color:#fff;">${esc(payload.platform)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">Dispositivo</td><td style="color:#fff;">${esc(payload.deviceName)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">OS Version</td><td style="color:#fff;">${esc(payload.osVersion)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">Contesto</td><td style="color:#fff;">${esc(payload.context)}</td></tr>
          <tr><td style="color:#aaa; padding: 6px 0;">User ID</td><td style="color:#fff;">${esc(payload.userId)}</td></tr>
        </table>
        <div style="margin-top: 16px; background: #16162a; border-radius: 8px; padding: 14px;">
          <p style="color: #e74c3c; font-weight: bold; margin: 0 0 8px;">Messaggio errore</p>
          <p style="color: #ccc; margin: 0; font-family: monospace; font-size: 13px; word-break: break-all;">${esc(payload.errorMessage)}</p>
        </div>
        ${payload.stackTrace ? `
        <div style="margin-top: 12px; background: #16162a; border-radius: 8px; padding: 14px;">
          <p style="color: #f39c12; font-weight: bold; margin: 0 0 8px;">Stack Trace</p>
          <pre style="color: #aaa; margin: 0; font-size: 11px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${esc(payload.stackTrace)}</pre>
        </div>` : ""}
      </div>
      <p style="text-align: center; color: #555; font-size: 11px; margin-top: 16px;">
        &copy; ${new Date().getFullYear()} BikerLink &mdash; Error Monitor
      </p>
    </div>
  `;
}

// SECURITY (Task #1450): errorsRateLimiter runs before errorsJson so that
// over-limit requests are rejected before any body parsing occurs.
router.post("/", errorsRateLimiter, errorsJson, async (req: Request, res: Response) => {
  try {
    const bodyParsed = gpsErrorSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return res.status(400).json({ message: bodyParsed.error.errors[0]?.message ?? "Payload non valido" });
    }
    const body = bodyParsed.data;
    const errorMessage = truncate(body.errorMessage, MAX_STRING_LEN);
    const stackTrace = body.stackTrace ? truncate(body.stackTrace, MAX_STACK_LEN) : null;
    const otaNumber = Number.isFinite(Number(body.otaNumber)) ? Number(body.otaNumber) : "?";
    const timestamp = typeof body.timestamp === "string" ? truncate(body.timestamp, 40) : new Date().toISOString();
    const platform = truncate(body.platform ?? "unknown", 20);
    const deviceName = body.deviceName ? truncate(body.deviceName, 100) : null;
    const osVersion = body.osVersion ? truncate(body.osVersion, 40) : null;
    const context = body.context ? truncate(body.context, 100) : "watchPositionAsync";

    const userId = req.session?.userId ?? "unauthenticated";

    const logEntry = {
      level: "ERROR",
      source: "gps",
      context,
      otaNumber,
      timestamp,
      platform,
      deviceName,
      osVersion,
      userId,
      errorMessage,
      stackTrace,
    };

    console.error("[GPS_ERROR]", JSON.stringify(logEntry));

    sendEmail(
      ADMIN_EMAIL,
      `[BikerLink] Errore GPS — OTA-${otaNumber} — ${platform}`,
      buildErrorEmailHtml({ ...logEntry, userId: String(userId) })
    ).catch((err) => console.error("[EMAIL] Errore invio notifica GPS error:", err));

    storage.createGpsError({
      userId: userId !== "unauthenticated" ? String(userId) : null,
      routeId: body.routeId ? truncate(body.routeId, 36) : null,
      otaNumber: Number.isFinite(Number(body.otaNumber)) ? Number(body.otaNumber) : null,
      platform: truncate(body.platform ?? "unknown", 20),
      osVersion: osVersion,
      context: context,
      errorMessage: errorMessage,
      stackTrace: stackTrace,
      speedKmh: body.speedKmh != null ? Number(body.speedKmh) || null : null,
    }).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[GPS_ERROR] Errore nel route /api/errors:", err);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
