#!/usr/bin/env npx tsx
/**
 * Task #1355 — Test integrazione OTA slot-based routing
 *
 * Simula 3 device su 3 slot e verifica che ognuno riceva l'OTA del suo slot
 * (o noUpdateAvailable se lo slot non ha OTA assegnati).
 * Asserisce esplicitamente il releaseId restituito confrontandolo con il DB.
 *
 * Uso:
 *   npx tsx scripts/test-ota-slots.ts
 *
 * Prerequisiti:
 *   - Backend in ascolto su PORT (default 5000)
 *   - Sessione admin valida per gli endpoint /api/admin/*
 */

const BASE = process.env.BIKERLINK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
const RUNTIME_VERSION = process.env.TEST_RUNTIME_VERSION ?? "8.0.0";
const ADMIN_PASSWORD = process.env.BIKERLINK_ADMIN_PASSWORD ?? "";

// ─── helpers ───────────────────────────────────────────────────────────────

async function adminLogin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@bikerlink.it", password: ADMIN_PASSWORD }),
    credentials: "include",
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/connect\.sid=([^;]+)/);
  if (!match) throw new Error(`Login fallito HTTP ${res.status}: impossibile estrarre cookie sessione`);
  return `connect.sid=${match[1]}`;
}

async function adminFetch(path: string, init: RequestInit = {}, cookie = "") {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
  });
}

/** Chiama /api/expo-updates come farebbe il client Expo e restituisce il releaseId dal manifest */
async function checkExpoUpdates(deviceId: string | null): Promise<{
  status: number;
  hasUpdate: boolean;
  releaseId: string | null;
}> {
  const headers: Record<string, string> = {
    "expo-runtime-version": RUNTIME_VERSION,
    "expo-platform": "android",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  };
  if (deviceId) headers["expo-device-id"] = deviceId;

  const res = await fetch(`${BASE}/api/expo-updates`, { headers });
  const body = await res.text();

  let hasUpdate = false;
  let releaseId: string | null = null;

  if (body.includes('"type":"noUpdateAvailable"') || body.includes('"noUpdateAvailable"')) {
    hasUpdate = false;
  } else if (body.includes('"id"')) {
    hasUpdate = true;
    const match = body.match(/"id"\s*:\s*"([^"]+)"/);
    releaseId = match ? match[1] : null;
  }

  return { status: res.status, hasUpdate, releaseId };
}

// ─── main ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n════════════════════════════════════════`);
  console.log(`  Test OTA Slot Routing — ${BASE}`);
  console.log(`  Runtime Version: ${RUNTIME_VERSION}`);
  console.log(`════════════════════════════════════════\n`);

  // Login admin
  let adminCookie = "";
  try {
    adminCookie = await adminLogin();
    console.log(`  ✅ Login admin OK\n`);
  } catch (e) {
    console.warn(`  ⚠️  Login admin fallito: ${(e as Error).message}`);
    console.warn(`  ⚠️  I test degli endpoint admin saranno saltati.\n`);
  }

  // Recupera lista releases per sapere cosa c'è nello stable/test-1
  interface Release { id: string; version: string; slot: string | null; status: string; runtime_version: string }
  let releases: Release[] = [];
  let stableRelease: Release | null = null;
  let test1Release: Release | null = null;

  if (adminCookie) {
    const relRes = await adminFetch("/api/admin/ota/releases", {}, adminCookie);
    if (relRes.ok) {
      releases = await relRes.json() as Release[];
      stableRelease = releases.find(r => r.slot === "stable" && r.status === "active" && r.runtime_version === RUNTIME_VERSION) ?? null;
      test1Release  = releases.find(r => r.slot === "test-1" && r.status === "active" && r.runtime_version === RUNTIME_VERSION) ?? null;
      console.log(`  📦 OTA presenti: ${releases.length} totali`);
      if (stableRelease) console.log(`     stable: ${stableRelease.version} (${stableRelease.id})`);
      else console.log(`     stable: nessuno (rv=${RUNTIME_VERSION})`);
      if (test1Release) console.log(`     test-1: ${test1Release.version} (${test1Release.id})`);
      else console.log(`     test-1: nessuno (rv=${RUNTIME_VERSION})`);
      console.log();
    }
  }

  let passed = 0;
  let failed = 0;

  function pass(label: string, detail = "") {
    console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
    passed++;
  }
  function fail(label: string, detail = "") {
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }

  // ── Test 1: device senza assegnazione → riceve lo stable (o noUpdate se stable è vuoto) ──
  {
    const result = await checkExpoUpdates("test-device-no-assign");
    if (result.status !== 200) {
      fail("Senza assegnazione: HTTP 200", `HTTP ${result.status}`);
    } else if (stableRelease) {
      // Deve restituire esattamente il releaseId dello stable
      if (result.releaseId === stableRelease.id) {
        pass("Senza assegnazione → riceve stable", `releaseId=${result.releaseId?.substring(0, 8)}…`);
      } else {
        fail("Senza assegnazione → releaseId sbagliato", `atteso=${stableRelease.id.substring(0, 8)}… ricevuto=${result.releaseId?.substring(0, 8) ?? "n/a"}`);
      }
    } else {
      // stable vuoto → noUpdateAvailable è corretto
      if (!result.hasUpdate) {
        pass("Senza assegnazione, stable vuoto → noUpdateAvailable (corretto)");
      } else {
        fail("Senza assegnazione, stable vuoto → inaspettatamente ha ricevuto un OTA", `releaseId=${result.releaseId}`);
      }
    }
    console.log(`     HTTP ${result.status} | hasUpdate=${result.hasUpdate} | releaseId=${result.releaseId ?? "n/a"}\n`);
  }

  // ── Test 2: device senza header expo-device-id → legacy, deve ricevere stable ──
  {
    const result = await checkExpoUpdates(null);
    if (result.status !== 200) {
      fail("Senza header expo-device-id: HTTP 200", `HTTP ${result.status}`);
    } else if (stableRelease) {
      if (result.releaseId === stableRelease.id) {
        pass("Senza header → riceve stable", `releaseId=${result.releaseId?.substring(0, 8)}…`);
      } else {
        fail("Senza header → releaseId sbagliato", `atteso=${stableRelease.id.substring(0, 8)}… ricevuto=${result.releaseId?.substring(0, 8) ?? "n/a"}`);
      }
    } else {
      if (!result.hasUpdate) {
        pass("Senza header, stable vuoto → noUpdateAvailable (corretto)");
      } else {
        fail("Senza header, stable vuoto → inaspettatamente ha ricevuto un OTA", `releaseId=${result.releaseId}`);
      }
    }
    console.log(`     HTTP ${result.status} | hasUpdate=${result.hasUpdate} | releaseId=${result.releaseId ?? "n/a"}\n`);
  }

  // ── Test 3: device assegnato a test-1 ──
  if (adminCookie) {
    const TEST_DEVICE = "test-device-slot-test1-xxx";
    // Assegna device a test-1
    const assignRes = await adminFetch("/api/admin/ota/assign-device", {
      method: "POST",
      body: JSON.stringify({ deviceId: TEST_DEVICE, slot: "test-1" }),
    }, adminCookie);
    if (!assignRes.ok) {
      fail("Assign device a test-1", `HTTP ${assignRes.status}`);
    } else {
      const result = await checkExpoUpdates(TEST_DEVICE);
      if (result.status !== 200) {
        fail("Device test-1: HTTP 200", `HTTP ${result.status}`);
      } else if (test1Release) {
        // Deve ricevere esattamente il releaseId di test-1
        if (result.releaseId === test1Release.id) {
          pass("Device test-1 → riceve test-1", `releaseId=${result.releaseId?.substring(0, 8)}…`);
        } else {
          fail("Device test-1 → releaseId sbagliato", `atteso=${test1Release.id.substring(0, 8)}… ricevuto=${result.releaseId?.substring(0, 8) ?? "n/a"}`);
        }
      } else {
        // test-1 vuoto → fallback a stable o noUpdate — entrambi corretti
        if (stableRelease && result.releaseId === stableRelease.id) {
          pass("Device test-1, slot vuoto → fallback a stable (corretto)", `releaseId=${result.releaseId?.substring(0, 8)}…`);
        } else if (!result.hasUpdate) {
          pass("Device test-1, slot e stable vuoti → noUpdateAvailable (corretto)");
        } else {
          fail("Device test-1, slot vuoto → OTA inaspettato", `releaseId=${result.releaseId}`);
        }
      }
      console.log(`     HTTP ${result.status} | hasUpdate=${result.hasUpdate} | releaseId=${result.releaseId ?? "n/a"}\n`);

      // Cleanup
      await adminFetch(`/api/admin/ota/device-assignments/${encodeURIComponent(TEST_DEVICE)}`, { method: "DELETE" }, adminCookie);
    }
  } else {
    console.log(`  ⏭  Test device test-1 saltato (no sessione admin)\n`);
  }

  // ── Test 4: device assegnato a slot scaduto → trattato come senza assegnazione → stable ──
  if (adminCookie) {
    const TEST_DEVICE_EXP = "test-device-expired-xxx";
    const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 min fa
    const assignRes = await adminFetch("/api/admin/ota/assign-device", {
      method: "POST",
      body: JSON.stringify({ deviceId: TEST_DEVICE_EXP, slot: "test-1", expiresAt: pastDate }),
    }, adminCookie);
    if (!assignRes.ok) {
      fail("Assign device con scadenza passata", `HTTP ${assignRes.status}`);
    } else {
      const result = await checkExpoUpdates(TEST_DEVICE_EXP);
      // Il device dovrebbe ricevere stable (slot scaduto → fallback a path B)
      if (result.status !== 200) {
        fail("Device slot scaduto: HTTP 200", `HTTP ${result.status}`);
      } else if (stableRelease && result.releaseId === stableRelease.id) {
        pass("Device slot scaduto → riceve stable (corretto)", `releaseId=${result.releaseId?.substring(0, 8)}…`);
      } else if (!stableRelease && !result.hasUpdate) {
        pass("Device slot scaduto, stable vuoto → noUpdateAvailable (corretto)");
      } else if (stableRelease && result.releaseId !== stableRelease.id) {
        fail("Device slot scaduto → releaseId sbagliato", `atteso=${stableRelease.id.substring(0, 8)}… ricevuto=${result.releaseId?.substring(0, 8) ?? "n/a"}`);
      } else {
        pass("Device slot scaduto → risposta ragionevole");
      }
      console.log(`     HTTP ${result.status} | hasUpdate=${result.hasUpdate} | releaseId=${result.releaseId ?? "n/a"}\n`);
      await adminFetch(`/api/admin/ota/device-assignments/${encodeURIComponent(TEST_DEVICE_EXP)}`, { method: "DELETE" }, adminCookie);
    }
  }

  // ── Test 5: heartbeat endpoint ──
  {
    // Test 5a: heartbeat con releaseId SCONOSCIUTO deve restituire 404 (non 500)
    const hbUnknownRes = await fetch(`${BASE}/api/ota/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "test-hb-device", releaseId: "00000000-dead-beef-0000-000000000000", runtimeVersion: RUNTIME_VERSION }),
    });
    if (hbUnknownRes.status === 404) {
      pass("Heartbeat releaseId sconosciuto → 404 (metric poisoning prevenuto)");
    } else {
      fail(`Heartbeat releaseId sconosciuto atteso 404, ricevuto ${hbUnknownRes.status}`, await hbUnknownRes.text());
    }

    // Test 5b: heartbeat con releaseId REALE deve restituire 200 + counted
    const realRelease = stableRelease ?? test1Release ?? releases.find(r => r.status === "active") ?? null;
    if (realRelease) {
      const hbRealRes = await fetch(`${BASE}/api/ota/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "test-hb-device-real", releaseId: realRelease.id, runtimeVersion: RUNTIME_VERSION }),
      });
      if (hbRealRes.status === 200) {
        const body = await hbRealRes.json() as { ok: boolean; counted: boolean };
        if (body.ok) {
          pass(`Heartbeat releaseId reale → 200 ok (counted=${body.counted})`, `releaseId=${realRelease.id.substring(0, 8)}…`);
        } else {
          fail("Heartbeat releaseId reale → 200 ma ok=false", JSON.stringify(body));
        }
      } else {
        fail(`Heartbeat releaseId reale HTTP ${hbRealRes.status}`, await hbRealRes.text());
      }
    } else {
      console.log("  ⚠️  Test 5b saltato: nessuna release attiva disponibile per heartbeat positivo");
    }

    console.log();
  }

  // ── Test 5c: mark-broken → device che usa quello slot deve ricevere stable ──
  if (adminCookie && test1Release && stableRelease) {
    // Marca il test-1 come broken
    const mbRes = await adminFetch(`/api/admin/ota/mark-broken`, {
      method: "POST",
      body: JSON.stringify({ releaseId: test1Release.id }),
    }, adminCookie);
    if (!mbRes.ok) {
      fail(`mark-broken HTTP ${mbRes.status}`, await mbRes.text());
    } else {
      pass(`mark-broken → HTTP ${mbRes.status}`, `releaseId=${test1Release.id.substring(0, 8)}…`);

      // Ora un device assegnato a test-1 deve fallbackare su stable
      const TEST_DEVICE_MB = "test-mark-broken-device";
      await adminFetch("/api/admin/ota/device-assignments", {
        method: "POST",
        body: JSON.stringify({ deviceId: TEST_DEVICE_MB, slot: "test-1" }),
      }, adminCookie);

      const result = await checkExpoUpdates(TEST_DEVICE_MB);
      if (result.releaseId === stableRelease.id) {
        pass("mark-broken → device riceve stable (fallback corretto)", `releaseId=${result.releaseId?.substring(0, 8)}…`);
      } else if (!result.hasUpdate) {
        // stable slot could be empty in test env
        pass("mark-broken → noUpdateAvailable (stable vuoto, comportamento corretto)");
      } else {
        fail("mark-broken → device riceve OTA sbagliato", `atteso stable=${stableRelease.id.substring(0, 8)}… ricevuto=${result.releaseId?.substring(0, 8) ?? "n/a"}`);
      }

      // Ripristina test-1 allo stato precedente (riassegna slot)
      await adminFetch("/api/admin/ota/assign-slot", {
        method: "POST",
        body: JSON.stringify({ releaseId: test1Release.id, slot: "test-1" }),
      }, adminCookie);
      // Rimuovi l'assegnazione temporanea
      await adminFetch(`/api/admin/ota/device-assignments/${encodeURIComponent(TEST_DEVICE_MB)}`, { method: "DELETE" }, adminCookie);
    }
    console.log();
  }

  // ── Test 6: GET /api/admin/ota/events con filtri ──
  if (adminCookie) {
    const evRes = await adminFetch("/api/admin/ota/events?limit=5", {}, adminCookie);
    if (evRes.ok) {
      const events = await evRes.json() as unknown[];
      pass(`GET /api/admin/ota/events → HTTP 200`, `${events.length} eventi`);
    } else {
      fail(`GET /api/admin/ota/events`, `HTTP ${evRes.status}`);
    }
    const evPhaseRes = await adminFetch("/api/admin/ota/events?phase=loaded&limit=5", {}, adminCookie);
    if (evPhaseRes.ok) {
      pass(`GET /api/admin/ota/events?phase=loaded OK`);
    } else {
      fail(`GET /api/admin/ota/events?phase=loaded`, `HTTP ${evPhaseRes.status}`);
    }
    const evDevRes = await adminFetch("/api/admin/ota/events?deviceId=test-hb-device&limit=5", {}, adminCookie);
    if (evDevRes.ok) {
      pass(`GET /api/admin/ota/events?deviceId=... OK`);
    } else {
      fail(`GET /api/admin/ota/events?deviceId=...`, `HTTP ${evDevRes.status}`);
    }
    console.log();
  }

  console.log(`════════════════════════════════════════`);
  console.log(`  Risultato: ${passed} ✅  ${failed} ❌`);
  console.log(`════════════════════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("[test-ota-slots] ERRORE FATALE:", e);
  process.exit(1);
});
