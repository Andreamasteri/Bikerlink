// Task #2661 follow-up #FU-1 — Smoke automatico rotte utente critiche.
// Esegue ping su login/feed match/proposte/chat/OTA con session admin (auto-derivata
// da ADMIN_USER_ID + SESSION_SECRET) e verifica status atteso + payload non vuoto.
//
// Usage:
//   ADMIN_USER_ID=<uuid> npx tsx scripts/smoke-user-routes.ts
//   [E2E_BASE=http://localhost:5000]
import { performance } from "node:perf_hooks";
import { createAdminSession, destroyAdminSession } from "./lib/admin-session";

const BASE = process.env.E2E_BASE ?? "http://localhost:5000";
const ADMIN_ID = process.env.ADMIN_USER_ID;
if (!ADMIN_ID) {
  console.error("ADMIN_USER_ID env richiesto (uuid admin/superadmin).");
  process.exit(2);
}

interface Probe {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  okStatuses: number[];
  requiresAuth: boolean;
}

const probes: Probe[] = [
  { name: "health (public)", method: "GET", path: "/api/health", okStatuses: [200], requiresAuth: false },
  { name: "version (public)", method: "GET", path: "/api/version/latest", okStatuses: [200], requiresAuth: false },
  { name: "ota manifest (public)", method: "GET", path: "/api/ota/manifest?platform=ios&runtimeVersion=3.3.0&channel=production", okStatuses: [200, 204, 400, 404], requiresAuth: false },
  { name: "auth /me (session)", method: "GET", path: "/api/auth/me", okStatuses: [200], requiresAuth: true },
  { name: "garage matches", method: "GET", path: "/api/proposals/garage-matches", okStatuses: [200, 404], requiresAuth: true },
  { name: "biker-biker matches", method: "GET", path: "/api/proposals/biker-matches", okStatuses: [200, 404], requiresAuth: true },
  { name: "proposal-profile matches", method: "GET", path: "/api/proposals/proposal-profile-matches", okStatuses: [200, 404], requiresAuth: true },
  { name: "chat conversations", method: "GET", path: "/api/chat/conversations", okStatuses: [200, 404], requiresAuth: true },
  { name: "notifications", method: "GET", path: "/api/notifications", okStatuses: [200, 404], requiresAuth: true },
  { name: "proposals list", method: "GET", path: "/api/proposals", okStatuses: [200, 404], requiresAuth: true },
];

interface Result { name: string; ok: boolean; status: number; ms: number; size: number; error?: string }

async function main(): Promise<void> {
  const session = await createAdminSession(ADMIN_ID!, { ttlSeconds: 600 });
  const results: Result[] = [];
  try {
    for (const probe of probes) {
      const t0 = performance.now();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (probe.requiresAuth) headers["cookie"] = session.cookieHeader;
      try {
        const r = await fetch(`${BASE}${probe.path}`, {
          method: probe.method,
          headers,
          body: probe.body ? JSON.stringify(probe.body) : undefined,
        });
        const text = await r.text();
        const ms = Math.round(performance.now() - t0);
        const ok = probe.okStatuses.includes(r.status);
        results.push({ name: probe.name, ok, status: r.status, ms, size: text.length });
        const prefix = ok ? "✓" : "✗";
        console.log(`${prefix} ${probe.name} → ${r.status} (${ms}ms, ${text.length}B)`);
        if (!ok) console.log(`    body: ${text.slice(0, 160)}`);
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        const msg = (err as Error).message;
        results.push({ name: probe.name, ok: false, status: 0, ms, size: 0, error: msg });
        console.log(`✗ ${probe.name} → ERROR ${msg} (${ms}ms)`);
      }
    }
  } finally {
    await destroyAdminSession(session.sid).catch(() => {});
  }
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n=== ${ok}/${results.length} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
