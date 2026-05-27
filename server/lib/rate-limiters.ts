import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { getTrustedClientIp } from "./abuse-rate-limit";

function userOrIpKey(req: Request): string {
  const sess = (req as Request & { session?: { userId?: string } }).session;
  if (sess?.userId) return `u:${sess.userId}`;
  return `ip:${getTrustedClientIp(req) ?? "unknown"}`;
}

// Admin matching endpoints — 30/min per admin user (or IP fallback).
export const adminMatchingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many matching admin requests, slow down." },
});

// Reports — 3 per day per user (per target enforced elsewhere if needed).
export const reportsRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Hai raggiunto il limite di segnalazioni giornaliere." },
});

// Text interpreter — 60/min per user.
export const textInterpreterRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Troppe richieste, attendi un attimo." },
});
