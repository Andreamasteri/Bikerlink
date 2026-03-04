import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const LOCKOUT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
      return obj
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<\/?(script|iframe|object|embed|form|input|button|textarea|select|option|style|link|meta|base)[^>]*>/gi, "")
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/javascript\s*:/gi, "");
    }
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === "object") {
      const clean: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        if (typeof key === "string" && key.startsWith("$")) continue;
        clean[key] = sanitize(value);
      }
      return clean;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    req.body = sanitize(req.body);
  }
  if (req.query && typeof req.query === "object") {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === "string") {
        req.query[key] = sanitize(req.query[key]);
      }
    }
  }
  next();
}

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Troppe richieste. Riprova tra un minuto." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Troppi tentativi. Riprova tra 15 minuti." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Troppi upload. Riprova tra un minuto." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export const messageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Troppi messaggi. Riprova tra un minuto." },
  keyGenerator: (req) => {
    const userId = (req.session as any)?.userId;
    return userId || req.ip || req.socket.remoteAddress || "unknown";
  },
});

export function checkAccountLockout(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const record = loginAttempts.get(ip);

  if (record) {
    const elapsed = Date.now() - record.firstAttempt;
    if (elapsed > LOCKOUT_WINDOW) {
      loginAttempts.delete(ip);
    } else if (record.count >= MAX_ATTEMPTS) {
      const remaining = Math.ceil((LOCKOUT_WINDOW - elapsed) / 60000);
      return res.status(429).json({
        message: `Account temporaneamente bloccato per troppi tentativi. Riprova tra ${remaining} minuti.`,
      });
    }
  }
  next();
}

export function recordFailedLogin(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const record = loginAttempts.get(ip);
  if (record) {
    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  }
}

export function clearLoginAttempts(req: Request) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  loginAttempts.delete(ip);
}
