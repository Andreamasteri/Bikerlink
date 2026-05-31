// Task #2694 — Token in-memory per consentire al self-check del watchdog
// di chiamare gli endpoint admin via HTTP loopback, senza una sessione admin
// reale. Il token è generato a runtime al primo accesso; vive solo in memoria
// e non è mai esposto via API. Il check lato middleware impone anche IP
// loopback (127.0.0.1 / ::1) per impedire usi da remoto anche se trapelato.
import crypto from "crypto";

const HEADER_NAME = "x-internal-probe-token";
// Task #2845 — header con cui il self-check indica quale moderatore impersonare
// quando esercita le route /api/moderator/* via loopback + probe token.
const MODERATOR_HEADER_NAME = "x-internal-probe-moderator-id";
let token: string | null = null;

export function getInternalProbeToken(): string {
  if (!token) token = crypto.randomBytes(32).toString("hex");
  return token;
}

export function getInternalProbeHeaderName(): string {
  return HEADER_NAME;
}

export function getInternalProbeModeratorHeaderName(): string {
  return MODERATOR_HEADER_NAME;
}

export function isLoopback(ip?: string | null): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.endsWith(":127.0.0.1");
}
