import crypto from "node:crypto";
import type { Request, Response } from "express";
import { db } from "../db";
import { siteVisits } from "@shared/db";
import { getTrustedClientIp } from "./abuse-rate-limit";
import { withBgDbSlot, isBgDbLimiterDropError } from "./bg-db-limiter";

// geoip-lite: bundled ~60 MB IPv4+IPv6 database, zero runtime cost, no external calls.
let geoip: typeof import("geoip-lite") | null = null;
try {
  geoip = require("geoip-lite") as typeof import("geoip-lite");
} catch {
  console.warn("[visitor-tracking] geoip-lite not available — country lookup disabled");
}

export const VISITOR_COOKIE_NAME = "bl_vid";
const VISITOR_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

function getSalt(): string {
  return process.env.VISITOR_IP_SALT || process.env.SESSION_SECRET || "bikerlink-visitor-fallback-salt";
}

export function hashIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${ip}|${getSalt()}`).digest("hex");
}

/**
 * Returns a coarse network prefix safe to persist:
 *  - IPv4: first 3 octets (a.b.c) — /24
 *  - IPv6: first 3 groups (xxxx:xxxx:xxxx) — /48
 */
export function ipPrefix(ip: string | undefined | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return parts.slice(0, 3).join(":");
  }
  const parts = ip.split(".");
  if (parts.length === 4) return parts.slice(0, 3).join(".");
  return null;
}

export function parseVisitorCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== VISITOR_COOKIE_NAME) continue;
    const value = part.slice(idx + 1).trim();
    if (/^[a-f0-9]{16,64}$/i.test(value)) return value.toLowerCase();
    return null;
  }
  return null;
}

export function ensureVisitorId(req: Request, res: Response): string {
  const existing = parseVisitorCookie(req);
  if (existing) return existing;
  const id = crypto.randomBytes(16).toString("hex");
  const isProd = process.env.NODE_ENV === "production";
  const cookie =
    `${VISITOR_COOKIE_NAME}=${id}; Path=/; Max-Age=${VISITOR_COOKIE_MAX_AGE_S}; ` +
    `HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;
  const prev = res.getHeader("Set-Cookie");
  if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, cookie]);
  } else if (typeof prev === "string") {
    res.setHeader("Set-Cookie", [prev, cookie]);
  } else {
    res.setHeader("Set-Cookie", cookie);
  }
  return id;
}

function pickLang(req: Request): string | null {
  const h = req.headers["accept-language"];
  if (!h || typeof h !== "string") return null;
  const first = h.split(",")[0]?.trim();
  if (!first) return null;
  return first.substring(0, 10);
}

function pickCountry(req: Request, ip: string | undefined): string | null {
  // Priority 1: proxy-injected geo headers (Cloudflare or generic).
  const candidates = [
    req.headers["cf-ipcountry"],
    req.headers["x-country-code"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length === 2) return c.toUpperCase();
  }

  // Priority 2: geoip-lite local database — zero cost, no network call.
  if (geoip && ip) {
    try {
      const geo = geoip.lookup(ip);
      if (geo?.country && geo.country.length === 2) return geo.country.toUpperCase();
    } catch {
      // non-blocking: lookup failure silently ignored
    }
  }

  return null;
}

export interface RecordVisitOpts {
  req: Request;
  visitorId: string;
  event?: "view" | "register" | "login";
  userId?: string | null;
  path?: string;
}

/**
 * Fire-and-forget DB insert. Never throws upstream; errors are logged.
 */
export function recordVisit(opts: RecordVisitOpts): void {
  const { req, visitorId } = opts;
  const ip = getTrustedClientIp(req);
  const ua = (req.headers["user-agent"] as string | undefined) || null;
  const referrer = (req.headers["referer"] as string | undefined) || null;
  const path = (opts.path ?? req.path ?? "").substring(0, 500);
  // Fire-and-forget, guarded by the bg-db-limiter kill-switch: if the DB is
  // slow (≥2 consecutive slow pings) the slot acquire throws
  // BgDbSlowKillSwitchError and we skip the insert entirely instead of adding
  // pressure to an already overloaded pool.
  withBgDbSlot(() =>
    db.insert(siteVisits)
      .values({
        visitorId,
        userId: opts.userId ?? null,
        event: opts.event ?? "view",
        path,
        referrer: referrer ? referrer.substring(0, 500) : null,
        userAgent: ua ? ua.substring(0, 500) : null,
        ipHash: hashIp(ip),
        ipPrefix: ipPrefix(ip),
        lang: pickLang(req),
        country: pickCountry(req, ip),
      })
      .execute()
  ).catch((err) => {
    if (!isBgDbLimiterDropError(err)) {
      console.warn("[site-visits] insert failed (non-blocking):", err?.message || err);
    }
  });
}
