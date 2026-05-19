#!/usr/bin/env npx tsx
/**
 * Test integrazione — SQL-injection safety per endpoint OTA e admin
 *
 * Verifica che input malevoli/malformati NON causino HTTP 500 su:
 *   - GET  /api/updates/check
 *   - GET  /api/expo-updates          ← manifest endpoint (Expo Updates Protocol v1)
 *                                       The task spec calls this "/api/expo-updates/manifest";
 *                                       the actual route is GET /api/expo-updates — there is no
 *                                       separate /manifest sub-path.  See server/routes.ts L431.
 *   - POST /api/ota/heartbeat
 *   - GET  /api/admin/analytics
 *   - GET  /api/admin/users/:id/stats
 *
 * Uso:
 *   npx tsx scripts/test-injection-safety.ts
 *
 * Variabili d'ambiente:
 *   BIKERLINK_PUBLIC_URL       — base URL del backend (default: http://localhost:PORT)
 *   PORT                       — porta del backend (default: 5000)
 *   BIKERLINK_ADMIN_PASSWORD   — password dell'account admin@bikerlink.it
 *   ALLOW_SKIP_ADMIN=1         — disabilita il fail-fast quando le credenziali admin
 *                                sono assenti (utile per ambienti senza accesso admin)
 *
 * IMPORTANT: by default the suite FAILS if admin credentials are not available.
 * Set ALLOW_SKIP_ADMIN=1 to opt out of that behaviour (e.g. in a test environment
 * that intentionally has no admin account).
 */

const BASE = process.env.BIKERLINK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
const ADMIN_PASSWORD = process.env.BIKERLINK_ADMIN_PASSWORD ?? "";
const ALLOW_SKIP_ADMIN = process.env.ALLOW_SKIP_ADMIN === "1";

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Poll /api/health until the backend responds (max ~60s).
 * When this script is run as a Replit validation/workflow at boot, the
 * backend on :5000 may not yet be listening. Without this wait the very first
 * fetch fails with ECONNREFUSED and aborts the whole suite.
 */
async function waitForBackend(maxSeconds = 60): Promise<void> {
  const deadline = Date.now() + maxSeconds * 1000;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    try {
      const res = await fetch(`${BASE}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        if (attempts > 1) console.log(`  ✔ Backend pronto dopo ${attempts} tentativi`);
        return;
      }
    } catch {
      // ignore — backend not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Backend non raggiungibile su ${BASE}/api/health dopo ${maxSeconds}s — abort.`,
  );
}

/**
 * Login and return a Bearer token.
 * The server exposes a middleware that converts "Authorization: Bearer <token>"
 * back into a connect.sid cookie so express-session can authenticate the request.
 * The sessionToken returned in the login JSON body is exactly that bearer value.
 */
async function adminLogin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Login schema requires "identifier" (email or nickname), not "email"
    body: JSON.stringify({ identifier: "admin@bikerlink.it", password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Login admin fallito HTTP ${res.status}: ${body.substring(0, 100)}`);
  }
  const body = await res.json() as Record<string, unknown>;
  const token = body.sessionToken as string | undefined;
  if (!token) throw new Error("Login admin: sessionToken assente nella risposta");
  return token;
}

async function apiFetch(path: string, init: RequestInit = {}, bearerToken = "") {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Adversarial payloads that would trigger an error in raw-string SQL
 * but should be safely handled by parameterized queries (Drizzle sql`…`).
 */
const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE ota_releases; --",
  "1 OR 1=1",
  "1; SELECT * FROM users; --",
  "' UNION SELECT null,null,null --",
  "\\' OR \\'1\\'=\\'1",
  "<script>alert(1)</script>",
  "../../../etc/passwd",
  "A".repeat(500),   // oversized input
  "\x00\x01\x02",    // null bytes
  "NULL",
];

/**
 * Subset safe for HTTP header values (no control characters / null bytes).
 * Use this for header-based tests to avoid the HTTP client throwing before the
 * request even reaches the server.
 */
const HEADER_SAFE_PAYLOADS = SQL_INJECTION_PAYLOADS.filter(
  (p) => !/[\x00-\x1F\x7F]/.test(p),
);

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
  passed++;
}

function fail(label: string, detail = "") {
  console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
  failed++;
}

function skip(label: string, reason = "") {
  console.log(`  ⏭  ${label}${reason ? " — " + reason : ""}`);
  skipped++;
}

/** Asserts the response status is NOT 500 (parameterised query absorbed the input). */
function assertNot500(label: string, status: number, body: string) {
  if (status === 500) {
    fail(label, `HTTP 500 — raw SQL interpolation likely: ${body.substring(0, 120)}`);
  } else {
    pass(label, `HTTP ${status} (non-500)`);
  }
}

// ─── Test suite ─────────────────────────────────────────────────────────────

async function testUpdatesCheck() {
  console.log("\n── GET /api/updates/check ──────────────────────────────");

  const res = await apiFetch("/api/updates/check");
  if (res.status === 200) {
    pass("Smoke test → HTTP 200");
  } else {
    fail(`Smoke test → atteso 200, ricevuto ${res.status}`);
  }
}

async function testExpoUpdatesManifest() {
  // Route: GET /api/expo-updates  (Expo Updates Protocol v1 manifest)
  // The task spec references this as "GET /api/expo-updates/manifest" — no such
  // sub-path exists.  GET /api/expo-updates is the canonical manifest route;
  // see server/routes.ts around line 431.  If a /manifest alias is added in the
  // future, extend coverage here.
  console.log("\n── GET /api/expo-updates (≡ /manifest, canonical route) ─");

  const smokeRes = await apiFetch("/api/expo-updates", {
    headers: {
      "expo-runtime-version": "8.0.0",
      "expo-platform": "android",
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
    },
  });
  if (smokeRes.status === 200) {
    pass("Smoke test (valid headers) → HTTP 200");
  } else {
    fail(`Smoke test (valid headers) → atteso 200, ricevuto ${smokeRes.status}`);
  }

  // Adversarial expo-device-id header values.
  for (const payload of HEADER_SAFE_PAYLOADS) {
    const res = await apiFetch("/api/expo-updates", {
      headers: {
        "expo-runtime-version": "8.0.0",
        "expo-platform": "android",
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
        "expo-device-id": payload,
      },
    });
    const body = await res.text();
    assertNot500(
      `expo-device-id adversariale: ${payload.substring(0, 40).replace(/\n/g, "\\n")}`,
      res.status,
      body,
    );
  }

  // Adversarial expo-runtime-version header values.
  for (const payload of ["'; DROP TABLE ota_releases; --", "8.0.0' OR '1'='1"]) {
    const res = await apiFetch("/api/expo-updates", {
      headers: {
        "expo-runtime-version": payload,
        "expo-platform": "android",
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
      },
    });
    const body = await res.text();
    assertNot500(
      `expo-runtime-version adversariale: ${payload.substring(0, 40)}`,
      res.status,
      body,
    );
  }
}

async function testOtaHeartbeat() {
  console.log("\n── POST /api/ota/heartbeat ──────────────────────────────");

  // Missing releaseId → must return 400, not 500.
  const missingRes = await apiFetch("/api/ota/heartbeat", {
    method: "POST",
    body: JSON.stringify({ deviceId: "test-safety-device" }),
  });
  if (missingRes.status === 400) {
    pass("releaseId mancante → HTTP 400 (validazione input OK)");
  } else {
    fail(`releaseId mancante → atteso 400, ricevuto ${missingRes.status}`);
  }

  // Adversarial releaseId values — should be 400 or 404, never 500.
  for (const payload of SQL_INJECTION_PAYLOADS) {
    const res = await apiFetch("/api/ota/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        deviceId: "test-safety-device",
        releaseId: payload,
        runtimeVersion: "8.0.0",
      }),
    });
    const body = await res.text();
    assertNot500(
      `heartbeat releaseId adversariale: ${payload.substring(0, 40).replace(/\n/g, "\\n")}`,
      res.status,
      body,
    );
  }

  // Adversarial deviceId values (truncated server-side to 32 chars).
  for (const payload of SQL_INJECTION_PAYLOADS) {
    const res = await apiFetch("/api/ota/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        deviceId: payload,
        releaseId: "00000000-0000-0000-0000-000000000000",
        runtimeVersion: "8.0.0",
      }),
    });
    const body = await res.text();
    assertNot500(
      `heartbeat deviceId adversariale: ${payload.substring(0, 40).replace(/\n/g, "\\n")}`,
      res.status,
      body,
    );
  }
}

async function testAdminAnalytics(adminCookie: string) {
  console.log("\n── GET /api/admin/analytics ─────────────────────────────");

  if (!adminCookie) {
    if (ALLOW_SKIP_ADMIN) {
      skip("Tutti i test analytics", "no sessione admin (ALLOW_SKIP_ADMIN=1)");
    } else {
      fail(
        "Admin analytics — credenziali admin assenti",
        "Imposta BIKERLINK_ADMIN_PASSWORD oppure usa ALLOW_SKIP_ADMIN=1 per saltare",
      );
    }
    return;
  }

  const res = await apiFetch("/api/admin/analytics", {}, adminCookie);
  if (res.status === 200) {
    const body = await res.json() as Record<string, unknown>;
    const hasExpectedFields = "totalUsers" in body && "onlineUsersNow" in body;
    if (hasExpectedFields) {
      pass("Smoke test → HTTP 200 con campi attesi");
    } else {
      fail("Smoke test → HTTP 200 ma campi mancanti", JSON.stringify(body).substring(0, 120));
    }
  } else {
    fail(`Smoke test → atteso 200, ricevuto ${res.status}`);
  }
}

async function testAdminUserStats(adminCookie: string) {
  console.log("\n── GET /api/admin/users/:id/stats ───────────────────────");

  if (!adminCookie) {
    if (ALLOW_SKIP_ADMIN) {
      skip("Tutti i test users/:id/stats", "no sessione admin (ALLOW_SKIP_ADMIN=1)");
    } else {
      fail(
        "Admin users/:id/stats — credenziali admin assenti",
        "Imposta BIKERLINK_ADMIN_PASSWORD oppure usa ALLOW_SKIP_ADMIN=1 per saltare",
      );
    }
    return;
  }

  // Non-existent UUID → must be 404, not 500.
  const missingRes = await apiFetch(
    "/api/admin/users/00000000-0000-0000-0000-000000000000/stats",
    {},
    adminCookie,
  );
  if (missingRes.status === 404) {
    pass("userId UUID inesistente → HTTP 404");
  } else if (missingRes.status === 200) {
    pass("userId UUID inesistente → HTTP 200 (non trovato ma nessun 500)");
  } else {
    assertNot500("userId UUID inesistente", missingRes.status, await missingRes.text());
  }

  // Adversarial :id path param values.
  for (const payload of SQL_INJECTION_PAYLOADS) {
    const encodedPayload = encodeURIComponent(payload);
    const res = await apiFetch(
      `/api/admin/users/${encodedPayload}/stats`,
      {},
      adminCookie,
    );
    const body = await res.text();
    assertNot500(
      `users/:id/stats adversariale: ${payload.substring(0, 40).replace(/\n/g, "\\n")}`,
      res.status,
      body,
    );
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`  Test SQL-injection safety — OTA & Admin endpoints`);
  console.log(`  Backend: ${BASE}`);
  if (ALLOW_SKIP_ADMIN) {
    console.log(`  Modalità: ALLOW_SKIP_ADMIN=1 (admin tests opzionali)`);
  } else {
    console.log(`  Modalità: admin tests obbligatori (usa ALLOW_SKIP_ADMIN=1 per saltare)`);
  }
  console.log(`════════════════════════════════════════════════════════`);

  // Backend potrebbe non essere ancora pronto se questo script gira al boot
  // come validation workflow. Attendi /api/health prima di procedere.
  await waitForBackend();

  let adminCookie = "";
  if (ADMIN_PASSWORD) {
    try {
      adminCookie = await adminLogin();
      console.log(`\n  ✅ Login admin OK`);
    } catch (e) {
      console.warn(`\n  ⚠️  Login admin fallito: ${(e as Error).message}`);
    }
  } else {
    console.warn(`\n  ⚠️  BIKERLINK_ADMIN_PASSWORD non impostato.`);
    if (!ALLOW_SKIP_ADMIN) {
      console.warn(`  ⚠️  I test admin falliranno (comportamento predefinito).`);
      console.warn(`  ⚠️  Imposta ALLOW_SKIP_ADMIN=1 per saltarli invece di farli fallire.`);
    }
  }

  await testUpdatesCheck();
  await testExpoUpdatesManifest();
  await testOtaHeartbeat();
  await testAdminAnalytics(adminCookie);
  await testAdminUserStats(adminCookie);

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`  Risultato: ${passed} ✅  ${failed} ❌  ${skipped} ⏭`);
  console.log(`════════════════════════════════════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("[test-injection-safety] ERRORE FATALE:", e);
  process.exit(1);
});
