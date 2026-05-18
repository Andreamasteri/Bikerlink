#!/usr/bin/env node
/**
 * validate-lastfm-callback.js
 *
 * Static validation that the Last.fm OAuth callback (bikerlink://lastfm-callback)
 * will be correctly intercepted by Android after the explicit intentFilter was
 * removed in Task #976.
 *
 * Checks:
 *  1. app.json declares scheme:"bikerlink" at the top level
 *     → Expo generates a generic Android intent filter for the whole bikerlink:// scheme
 *     → This covers bikerlink://lastfm-callback as a subset
 *  2. No conflicting android.intentFilters remain in app.json
 *  3. expo-web-browser plugin is listed (required for openAuthSessionAsync)
 *  4. music.tsx uses openAuthSessionAsync with the correct redirect URL
 *  5. openAuthSessionAsync result is inspected (cancel/dismiss handled)
 *
 * Usage: node scripts/validate-lastfm-callback.js
 * Exit 0 = all checks pass, Exit 1 = one or more checks failed.
 */

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✓  ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  ✗  ${msg}`);
  failed++;
}

// ── 1. app.json checks ────────────────────────────────────────────────────────
console.log("\n[1] app.json — scheme & intent filter configuration");

const appJsonPath = path.join(__dirname, "..", "app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const expo = appJson.expo ?? {};

if (expo.scheme === "bikerlink") {
  pass('expo.scheme === "bikerlink"  →  generic Android intent filter <data android:scheme="bikerlink"/> generated');
} else {
  fail(`expo.scheme is "${expo.scheme}" — expected "bikerlink"`);
}

const androidIntentFilters = expo.android?.intentFilters;
if (!androidIntentFilters || androidIntentFilters.length === 0) {
  pass("expo.android.intentFilters is absent — no redundant per-host filter present");
} else {
  const lastfmFilter = androidIntentFilters.find((f) =>
    (f.data ?? []).some((d) => d.scheme === "bikerlink" && d.host === "lastfm-callback")
  );
  if (lastfmFilter) {
    fail("Explicit bikerlink://lastfm-callback intentFilter still present — expected it to be removed (Task #976)");
  } else {
    pass("No bikerlink://lastfm-callback specific intentFilter found (other filters present but not conflicting)");
  }
}

// ── 2. expo-web-browser plugin ────────────────────────────────────────────────
console.log("\n[2] app.json — expo-web-browser plugin");

const plugins = expo.plugins ?? [];
const hasWebBrowser = plugins.some((p) =>
  p === "expo-web-browser" || (Array.isArray(p) && p[0] === "expo-web-browser")
);
if (hasWebBrowser) {
  pass("expo-web-browser plugin is registered");
} else {
  fail("expo-web-browser plugin NOT found in app.json plugins — openAuthSessionAsync requires it");
}

// ── 3. music.tsx — openAuthSessionAsync usage ─────────────────────────────────
console.log("\n[3] app/(tabs)/music.tsx — OAuth callback code path");

const musicPath = path.join(__dirname, "..", "app", "(tabs)", "music.tsx");
const musicSrc = fs.readFileSync(musicPath, "utf8");

if (musicSrc.includes('openAuthSessionAsync(data.authUrl, "bikerlink://lastfm-callback")')) {
  pass('openAuthSessionAsync called with redirectUrl "bikerlink://lastfm-callback"');
} else {
  fail('openAuthSessionAsync call with "bikerlink://lastfm-callback" not found — check music.tsx');
}

if (musicSrc.includes('result.type === "cancel"') || musicSrc.includes("result.type === 'cancel'")) {
  pass("openAuthSessionAsync result is inspected — cancel handled (avoids stale Confirm button)");
} else {
  fail("openAuthSessionAsync result is not inspected — user cancellation is silently ignored");
}

if (musicSrc.includes('[Last.fm OAuth] openAuthSessionAsync result:')) {
  pass("Instrumentation logging present — result.type and redirect URL logged on every auth attempt");
} else {
  fail("Instrumentation logging NOT present — add console.log for result.type to aid live device verification");
}

// ── 4. server — callback URL in auth-token endpoint ───────────────────────────
console.log("\n[4] server/routes/lastfm.ts — callback URL in authUrl");

const serverLastfmPath = path.join(__dirname, "..", "server", "routes", "lastfm.ts");
const serverSrc = fs.readFileSync(serverLastfmPath, "utf8");

if (serverSrc.includes("cb=bikerlink://lastfm-callback")) {
  pass('auth-token endpoint builds authUrl with cb=bikerlink://lastfm-callback');
} else {
  fail('Expected cb=bikerlink://lastfm-callback in server/routes/lastfm.ts — not found');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  Passed: ${passed}   Failed: ${failed}`);

if (failed === 0) {
  console.log("\n  ALL CHECKS PASSED — static configuration is correct.");
  console.log("  Live Android device manual QA checklist (run on production APK):");
  console.log("  ① Music tab → Last.fm connect → browser opens at last.fm/api/auth/");
  console.log("  ② Approve → browser closes → Metro/Logcat shows:");
  console.log('      [Last.fm OAuth] openAuthSessionAsync result: success bikerlink://lastfm-callback?token=...');
  console.log("  ③ Tap Confirm → success alert with username");
  console.log("  ④ Repeat but cancel in browser → app returns to idle with NO Confirm button");
  console.log("  ⑤ adb logcat | grep -E 'ActivityNotFoundException|bikerlink' → 0 errors\n");
  process.exit(0);
} else {
  console.error("\n  CHECKS FAILED — see ✗ lines above.\n");
  process.exit(1);
}
