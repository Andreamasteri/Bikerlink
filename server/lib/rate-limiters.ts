import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";
import { getTrustedClientIp } from "./abuse-rate-limit";
import { sendError } from "./api-response";

function userOrIpKey(req: Request): string {
  const sess = (req as Request & { session?: { userId?: string } }).session;
  if (sess?.userId) return `u:${sess.userId}`;
  const ip = getTrustedClientIp(req) ?? "";
  return `ip:${ipKeyGenerator(ip)}`;
}

// Returns true for server-side internal requests that must not be counted
// against the admin matching rate limit:
//   1. x-internal-request: watchdog  — watchdog proposer / auto-fix calls
//   2. internal probe token + loopback IP — campaigns/matching self-check probes
function isInternalMatchingRequest(req: Request): boolean {
  if (req.headers["x-internal-request"] === "watchdog") return true;
  try {
    const mod = require("../ai/watchdog/internal-token") as
      typeof import("../ai/watchdog/internal-token");
    const hdr = req.headers[mod.getInternalProbeHeaderName()];
    const token = Array.isArray(hdr) ? hdr[0] : hdr;
    if (token && token === mod.getInternalProbeToken() && mod.isLoopback(req.ip)) return true;
  } catch { /* module not available */ }
  return false;
}

// Admin matching endpoints — 120/min per admin user (or IP fallback).
// Multiple matching admin screens poll simultaneously (lock-state 5s, metrics 15s,
// stats 30s, etc.) and can collectively exceed a lower limit when open together.
// Internal server-side calls (watchdog, self-check probes) are exempted via skip().
export const adminMatchingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: isInternalMatchingRequest,
  handler: (_req, res: Response) => {
    sendError(res, 429, "Too many matching admin requests, slow down.");
  },
});

// Reports — 3 per day per user (per target enforced elsewhere if needed).
export const reportsRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (_req, res: Response) => {
    sendError(res, 429, "Hai raggiunto il limite di segnalazioni giornaliere.");
  },
});

// Text interpreter — 60/min per user.
export const textInterpreterRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (_req, res: Response) => {
    sendError(res, 429, "Troppe richieste, attendi un attimo.");
  },
});
