import { cfAccessHeaders } from "../server/lib/cf-access";

/**
 * validate-credentials.ts
 *
 * Script read-only di validazione funzionale delle credenziali esterne.
 * Non effettua scritture, non modifica dati, non ha side-effect.
 *
 * Uso: npx tsx scripts/validate-credentials.ts
 */

interface Result {
  service: string;
  credential: string;
  required: "mandatory" | "optional" | "flag";
  present: boolean;
  valid: boolean | null;
  note: string;
}

const results: Result[] = [];

function record(
  service: string,
  credential: string,
  required: Result["required"],
  present: boolean,
  valid: boolean | null,
  note: string,
) {
  results.push({ service, credential, required, present, valid, note });
}

async function fetchCheck(
  url: string,
  opts: RequestInit = {},
  expectedStatus = 200,
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    const body = await res.text();
    return { ok: res.status === expectedStatus, status: res.status, body: body.slice(0, 200) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: msg };
  }
}

/**
 * Cloudflare Access headers are only safe to attach to our own tunnel hosts.
 * The validator must follow the same rule as the production callers and must
 * never disclose the service token to a provider URL accidentally configured in
 * a secret.
 */
function selfHostedHeaders(
  url: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const isBikerLinkHost =
      hostname === "biker-link.net" || hostname.endsWith(".biker-link.net");
    return isBikerLinkHost ? { ...cfAccessHeaders(), ...extra } : extra;
  } catch {
    return extra;
  }
}

function configuredAccessPair(): { id: string; secret: string } {
  return {
    id: process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "",
    secret: process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "",
  };
}

function configuredSelfHostedUrls(): string[] {
  const names = [
    "GRAPHHOPPER_URL",
    "VALHALLA_URL",
    "PHOTON_URL",
    "NOMINATIM_URL",
    "BOWIE_OLLAMA_URL",
    "HORUS_OLLAMA_URL",
    "ARES_OLLAMA_URL",
    "DIAG_OLLAMA_URL",
    "THINKCENTRE_METRICS_URL",
  ];
  return [...new Set(
    names
      .map((name) => process.env[name]?.trim())
      .filter((value): value is string => Boolean(value))
      .filter((value) => {
        try {
          const hostname = new URL(value).hostname.toLowerCase();
          return hostname === "biker-link.net" || hostname.endsWith(".biker-link.net");
        } catch {
          return false;
        }
      }),
  )];
}

async function checkCloudflare() {
  const { id, secret } = configuredAccessPair();
  const protectedUrls = configuredSelfHostedUrls();
  const accessRequired = protectedUrls.length > 0 ? "mandatory" : "optional";

  if (!id && !secret) {
    record(
      "Cloudflare Access",
      "CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET",
      accessRequired,
      false,
      accessRequired === "mandatory" ? false : null,
      accessRequired === "mandatory"
        ? "Mancano entrambi: gli endpoint Cloudflare configurati non passeranno Access."
        : "Non configurati; nessun endpoint *.biker-link.net è attivo in questo ambiente.",
    );
  } else if (!id || !secret) {
    record(
      "Cloudflare Access",
      "CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET",
      accessRequired,
      true,
      false,
      "Coppia incompleta: servono contemporaneamente client ID e client secret.",
    );
  } else {
    const idShapeOk = id.endsWith(".access");
    record(
      "Cloudflare Access",
      "CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET",
      accessRequired,
      true,
      idShapeOk,
      idShapeOk
        ? `Coppia presente e client ID nel formato atteso; endpoint da verificare: ${protectedUrls.length}.`
        : "Client ID con formato inatteso: atteso il suffisso .access.",
    );
  }

  const apiToken = process.env.CF_API_TOKEN?.trim();
  if (!apiToken) {
    record(
      "Cloudflare API",
      "CF_API_TOKEN",
      "optional",
      false,
      null,
      "Non impostato; serve solo allo script amministrativo di provisioning del tunnel Redis.",
    );
  } else {
    const r = await fetchCheck("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    record(
      "Cloudflare API",
      "CF_API_TOKEN",
      "optional",
      true,
      r.ok,
      r.ok
        ? "Token verificato dall'endpoint ufficiale /user/tokens/verify."
        : `Verifica fallita: HTTP ${r.status} — ${r.body.slice(0, 100)}`,
    );
  }
}

// ── Database ──────────────────────────────────────────────────────────────────

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    record("Database", "DATABASE_URL", "mandatory", false, false, "Non configurata");
    return;
  }
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    await pool.query("SELECT 1");
    await pool.end();
    record("Database", "DATABASE_URL", "mandatory", true, true, "Connessione OK");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    record("Database", "DATABASE_URL", "mandatory", true, false, `Errore: ${msg.slice(0, 100)}`);
  }
}

// ── Sessioni / Sicurezza ──────────────────────────────────────────────────────

function checkSecurity() {
  const secret = process.env.SESSION_SECRET;
  record("Sessioni", "SESSION_SECRET", "mandatory", !!secret, secret ? true : false,
    secret ? `Presente (${secret.length} char)` : "Non configurata — sessioni non funzionanti");

  const salt = process.env.VISITOR_IP_SALT;
  record("Visitor tracking", "VISITOR_IP_SALT", "optional", !!salt, null,
    salt ? "Presente" : "Non configurata — hash IP non salato");

  const osmSecret = process.env.OSM_UPDATE_SECRET;
  record("OSM update", "OSM_UPDATE_SECRET", "optional", !!osmSecret, null,
    osmSecret ? "Presente" : "Non configurata — endpoint OSM update non protetto");
}

// ── AI — Modelli linguistici ──────────────────────────────────────────────────

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    record("OpenAI", "OPENAI_API_KEY", "mandatory", false, false, "Non configurata");
    return;
  }
  const r = await fetchCheck("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  record("OpenAI", "OPENAI_API_KEY", "mandatory", true, r.ok,
    r.ok ? "HTTP 200 — lista modelli OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  const keyAlias = process.env.GOOGLE_API_KEY;
  const active = key ?? keyAlias;
  const credName = key ? "GEMINI_API_KEY" : "GOOGLE_API_KEY";

  if (!active) {
    record("Gemini", "GEMINI_API_KEY", "optional", false, null,
      "Non configurata (opzionale — usa OpenAI come fallback)");
    record("Gemini alias", "GOOGLE_API_KEY", "optional", false, null,
      "Non configurata — alias ridondante di GEMINI_API_KEY, non necessaria se GEMINI_API_KEY è presente");
    return;
  }
  const r = await fetchCheck(`https://generativelanguage.googleapis.com/v1beta/models?key=${active}`);
  record("Gemini", credName, "optional", true, r.ok,
    r.ok ? "HTTP 200 — lista modelli OK" : `HTTP ${r.status}`);

  if (key && keyAlias) {
    record("Gemini alias", "GOOGLE_API_KEY", "optional", true, null,
      "Configurata ma ridondante — GEMINI_API_KEY ha priorità");
  } else if (!key && keyAlias) {
    // già registrato sopra
  } else {
    record("Gemini alias", "GOOGLE_API_KEY", "optional", false, null,
      "Non configurata — alias ridondante; non necessaria con GEMINI_API_KEY presente");
  }
}

async function checkOllama() {
  const endpoints = [
    ["BOWIE_OLLAMA_URL", "BOWIE_OLLAMA_TOKEN"],
    ["HORUS_OLLAMA_URL", "HORUS_OLLAMA_TOKEN"],
    ["ARES_OLLAMA_URL", "ARES_OLLAMA_TOKEN"],
    ["DIAG_OLLAMA_URL", "DIAG_OLLAMA_TOKEN"],
  ] as const;

  const model = process.env.BOWIE_OLLAMA_MODEL;
  record(
    "Ollama",
    "BOWIE_OLLAMA_MODEL",
    "optional",
    !!model,
    null,
    model ? `Configurato: ${model}` : "Non configurato (default: qwen3:1.7b)",
  );

  const checked = new Set<string>();
  for (const [urlName, tokenName] of endpoints) {
    const url = process.env[urlName]?.trim();
    const token = process.env[tokenName]?.trim();
    if (!url || checked.has(url)) continue;
    checked.add(url);

    record("Ollama", urlName, "optional", true, null, `Configurata: ${url}`);
    record(
      "Ollama",
      tokenName,
      "optional",
      !!token,
      null,
      token ? `Presente (${token.length} char)` : "Non configurata",
    );

    const r = await fetchCheck(`${url.replace(/\/$/, "")}/api/tags`, {
      headers: selfHostedHeaders(url, token ? { "X-Ollama-Token": token } : {}),
    });
    record(
      "Ollama health",
      `${urlName} + ${tokenName}`,
      "optional",
      true,
      r.ok,
      r.ok ? "HTTP 200 — server raggiungibile" : `HTTP ${r.status} — ${r.body.slice(0, 80)}`,
    );
  }

  if (checked.size === 0) {
    record("Ollama", "BOWIE_OLLAMA_URL", "optional", false, null,
      "Non configurata (opzionale — usa cloud AI come fallback)");
  }
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function checkGraphHopper() {
  const ghUrl = process.env.GRAPHHOPPER_URL;
  const token = process.env.GRAPHHOPPER_TOKEN;
  const apiKey = process.env.GRAPHHOPPER_API_KEY;

  record("GraphHopper self-hosted", "GRAPHHOPPER_URL", "optional", !!ghUrl, null,
    ghUrl ? `Configurata: ${ghUrl}` : "Non configurata");

  record("GraphHopper self-hosted", "GRAPHHOPPER_TOKEN", "optional", !!token, null,
    token ? `Presente (${token.length} char) — header X-GH-Token` : "Non configurato");

  if (ghUrl) {
    const r = await fetchCheck(`${ghUrl.replace(/\/$/, "")}/health`, {
      headers: selfHostedHeaders(ghUrl, token ? { "X-GH-Token": token } : {}),
    });
    record("GraphHopper self-hosted health", "GRAPHHOPPER_URL", "optional", true, r.ok,
      r.ok ? "Health OK" : `HTTP ${r.status} — ${r.body.slice(0, 80)}`);
  }

  if (!apiKey) {
    record("GraphHopper cloud", "GRAPHHOPPER_API_KEY", "mandatory", false, false,
      "Non configurata — nessun fallback cloud; routing non funzionante se self-hosted è offline");
  } else {
    const r = await fetchCheck(`https://graphhopper.com/api/1/info?key=${apiKey}`);
    record("GraphHopper cloud", "GRAPHHOPPER_API_KEY", "mandatory", true, r.ok,
      r.ok ? "HTTP 200 — info API OK (cloud attivo)" : `HTTP ${r.status}`);
  }
}

async function checkValhalla() {
  const url = process.env.VALHALLA_URL;
  const key = process.env.VALHALLA_API_KEY;

  const vallhallaPresent = url !== undefined;
  const valhhallaMsg = !vallhallaPresent
    ? "Non configurata"
    : url!.length === 0
      ? "Configurata come stringa vuota — Valhalla disabilitato (comportamento corretto)"
      : `Configurata: ${url}`;
  record("Valhalla", "VALHALLA_URL", "optional", vallhallaPresent, null, valhhallaMsg);

  record("Valhalla", "VALHALLA_API_KEY", "optional", !!key, null,
    key ? "Presente" : "Non configurata (non necessaria con VALHALLA_URL vuota)");

  if (url?.trim()) {
    const r = await fetchCheck(`${url.trim().replace(/\/$/, "")}/status`, {
      headers: selfHostedHeaders(
        url,
        key ? { "X-Valhalla-Key": key } : {},
      ),
    });
    record(
      "Valhalla health",
      "VALHALLA_URL + VALHALLA_API_KEY",
      "optional",
      true,
      r.ok,
      r.ok ? "HTTP 200 — status OK" : `HTTP ${r.status} — ${r.body.slice(0, 80)}`,
    );
  }
}

async function checkPhoton() {
  const url = process.env.PHOTON_URL?.trim();
  const token = process.env.PHOTON_TOKEN?.trim();
  record(
    "Photon self-hosted",
    "PHOTON_URL",
    "optional",
    !!url,
    null,
    url ? `Configurata: ${url}` : "Non configurata",
  );
  record(
    "Photon self-hosted",
    "PHOTON_TOKEN",
    "optional",
    !!token,
    null,
    token ? `Presente (${token.length} char)` : "Non configurato",
  );
  if (!url) return;

  const r = await fetchCheck(
    `${url.replace(/\/$/, "")}/api/?q=Roma&limit=1&lang=default`,
    { headers: selfHostedHeaders(url, token ? { "X-Photon-Token": token } : {}) },
  );
  record(
    "Photon health",
    "PHOTON_URL + PHOTON_TOKEN",
    "optional",
    true,
    r.ok,
    r.ok ? "Query geocoding OK" : `HTTP ${r.status} — ${r.body.slice(0, 80)}`,
  );
}

async function checkR2() {
  const names = [
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BUCKET",
    "R2_PRIVATE_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ] as const;
  const present = names.filter((name) => Boolean(process.env[name]?.trim()));
  if (present.length === 0) {
    record("Cloudflare R2", "R2_*", "optional", false, null, "Non configurato");
    return;
  }
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    record(
      "Cloudflare R2",
      "R2_*",
      "mandatory",
      true,
      false,
      `Configurazione incompleta; mancanti: ${missing.join(", ")}`,
    );
    return;
  }

  const endpoint = process.env.R2_ENDPOINT!.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL!.trim();
  const publicBucket = process.env.R2_PUBLIC_BUCKET!.trim();
  const privateBucket = process.env.R2_PRIVATE_BUCKET!.trim();
  const errors: string[] = [];
  try {
    if (new URL(endpoint).protocol !== "https:") errors.push("R2_ENDPOINT non HTTPS");
  } catch {
    errors.push("R2_ENDPOINT non valido");
  }
  try {
    if (new URL(publicBaseUrl).protocol !== "https:") errors.push("R2_PUBLIC_BASE_URL non HTTPS");
  } catch {
    errors.push("R2_PUBLIC_BASE_URL non valido");
  }
  if (publicBucket === privateBucket) errors.push("bucket pubblico e privato uguali");
  if (errors.length > 0) {
    record("Cloudflare R2", "R2_*", "mandatory", true, false, errors.join("; "));
    return;
  }

  try {
    const { objectExists } = await import("../server/objectStorage");
    // HEAD su due chiavi sentinella: nessuna scrittura o modifica di dati.
    await objectExists("__bikerlink_cloudflare_audit__/missing-object");
    await objectExists("private/__bikerlink_cloudflare_audit__/missing-object");
    record("Cloudflare R2", "R2_*", "mandatory", true, true,
      "Endpoint, firma SigV4 e accesso HEAD verificati su entrambi i bucket.");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    record("Cloudflare R2", "R2_*", "mandatory", true, false,
      `Round-trip read-only fallito: ${msg.slice(0, 120)}`);
  }
}

async function checkTomTom() {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    record("TomTom", "TOMTOM_API_KEY", "mandatory", false, false,
      "Non configurata — map matching / snap-to-roads non disponibile (lancia errore)");
    return;
  }
  const r = await fetchCheck(
    `https://api.tomtom.com/routing/1/calculateRoute/52.50931,13.42936:52.50274,13.43872/json?key=${key}&routeType=fastest&travelMode=car&maxAlternatives=0`,
  );
  record("TomTom", "TOMTOM_API_KEY", "mandatory", true, r.ok,
    r.ok ? "HTTP 200 — routing API OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
}

async function checkMapbox() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    record("Mapbox", "MAPBOX_ACCESS_TOKEN", "mandatory", false, false,
      "Non configurata — fallback routing emergenza non disponibile (lancia errore)");
    return;
  }
  const isValidFormat = token.startsWith("pk.") || token.startsWith("sk.");
  if (!isValidFormat) {
    record("Mapbox", "MAPBOX_ACCESS_TOKEN", "mandatory", true, false,
      `Formato non valido — deve iniziare con pk. o sk. (trovato: ${token.slice(0, 8)}...)`);
    return;
  }
  const r = await fetchCheck(
    `https://api.mapbox.com/directions/v5/mapbox/driving/13.3888%2C52.5166%3B13.4094%2C52.5244?geometries=geojson&access_token=${token}`,
  );
  record("Mapbox", "MAPBOX_ACCESS_TOKEN", "mandatory", true, r.ok,
    r.ok ? "HTTP 200 — directions OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
}

// ── Tile / Mappe ──────────────────────────────────────────────────────────────

async function checkTileProviders() {
  const maplibreKey = process.env.MAPLIBRE_API_KEY;
  record("MapLibre/MapTiler 3D terrain", "MAPLIBRE_API_KEY", "optional", !!maplibreKey, null,
    maplibreKey ? "Presente" : "Non configurata — terrain 3D in demo mode (bassa risoluzione)");

  const maptilerKey = process.env.MAPTILER_API_KEY;
  if (!maptilerKey) {
    record("MapTiler tiles", "MAPTILER_API_KEY", "optional", false, null,
      "Non configurata — layer MapTiler Streets/Outdoor non disponibili (opzionale, tile gratuite Carto/Stadia come fallback)");
  } else {
    const r = await fetchCheck(
      `https://api.maptiler.com/maps/streets-v2/0/0/0.png?key=${maptilerKey}`,
    );
    record("MapTiler tiles", "MAPTILER_API_KEY", "optional", true, r.ok,
      r.ok ? "HTTP 200 — tile OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
  }

  const thunderforestKey = process.env.THUNDERFOREST_API_KEY;
  if (!thunderforestKey) {
    record("Thunderforest tiles", "THUNDERFOREST_API_KEY", "optional", false, null,
      "Non configurata — layer Thunderforest Cycle non disponibile (opzionale)");
  } else {
    const r = await fetchCheck(
      `https://a.tile.thunderforest.com/cycle/0/0/0.png?apikey=${thunderforestKey}`,
    );
    record("Thunderforest tiles", "THUNDERFOREST_API_KEY", "optional", true, r.ok,
      r.ok ? "HTTP 200 — tile OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
  }

  const owmKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!owmKey) {
    record("OpenWeatherMap overlay", "OPENWEATHERMAP_API_KEY", "optional", false, null,
      "Non configurata — overlay nuvole/meteo non disponibile (opzionale)");
  } else {
    const r = await fetchCheck(
      `https://tile.openweathermap.org/map/clouds_new/0/0/0.png?appid=${owmKey}`,
    );
    record("OpenWeatherMap overlay", "OPENWEATHERMAP_API_KEY", "optional", true, r.ok,
      r.ok ? "HTTP 200 — tile OK" : `HTTP ${r.status}: ${r.body.slice(0, 80)}`);
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function checkGmail() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  record("Gmail", "GMAIL_USER", "mandatory", !!user, null,
    user ? `Configurata: ${user}` : "Non configurata");

  record("Gmail", "GMAIL_APP_PASSWORD", "mandatory", !!pass, null,
    pass ? `Presente (${pass.length} char)` : "Non configurata — email non funzionante");

  if (!user || !pass) return;

  try {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await t.verify();
    record("Gmail auth", "GMAIL_USER + GMAIL_APP_PASSWORD", "mandatory", true, true,
      `Autenticazione SMTP OK (${user})`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    record("Gmail auth", "GMAIL_USER + GMAIL_APP_PASSWORD", "mandatory", true, false,
      `Errore auth: ${msg.slice(0, 120)}`);
  }
}

// ── Musica (Last.fm) ──────────────────────────────────────────────────────────

async function checkLastFm() {
  const key = process.env.LASTFM_API_KEY;
  const secret = process.env.LASTFM_SHARED_SECRET;

  if (!key) {
    record("Last.fm", "LASTFM_API_KEY", "optional", false, null,
      "Non configurata (opzionale — feature radio)");
  } else {
    const r = await fetchCheck(
      `https://ws.audioscrobbler.com/2.0/?method=chart.getTopArtists&api_key=${key}&format=json&limit=1`,
    );
    record("Last.fm", "LASTFM_API_KEY", "optional", true, r.ok,
      r.ok ? "HTTP 200 — API OK" : `HTTP ${r.status}`);
  }

  record("Last.fm", "LASTFM_SHARED_SECRET", "optional", !!secret, null,
    secret ? `Presente (${secret.length} char)` : "Non configurata (opzionale)");
}

// ── Cache / Redis ─────────────────────────────────────────────────────────────

async function checkRedis() {
  const url = process.env.TC_DRAGONFLY_URL ?? process.env.REDIS_URL ?? process.env.REDIS_URI;
  const credName = process.env.TC_DRAGONFLY_URL ? "TC_DRAGONFLY_URL" : process.env.REDIS_URL ? "REDIS_URL" : "REDIS_URI";

  if (!url) {
    record("Redis", "TC_DRAGONFLY_URL", "optional", false, null,
      "Non configurata (opzionale) — in-memory fallback attivo; BullMQ e pub/sub distribuiti non disponibili");
    return;
  }
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await new Promise<void>((resolve, reject) => {
      client.once("ready", () => { client.disconnect(); resolve(); });
      client.once("error", (e) => { client.disconnect(); reject(e); });
      setTimeout(() => { client.disconnect(); reject(new Error("timeout")); }, 5000);
    });
    record("Redis", credName, "optional", true, true, "Connessione OK");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    record("Redis", credName, "optional", true, false, `Errore: ${msg.slice(0, 100)}`);
  }
}

// ── Monitoring e Flag ─────────────────────────────────────────────────────────

function checkMonitoringAndFlags() {
  const dsn = process.env.SENTRY_DSN;
  record("Sentry", "SENTRY_DSN", "optional", !!dsn, null,
    dsn ? "Configurata" : "Non configurata (opzionale) — error tracking disabilitato");

  const routing = process.env.ROUTING_DISABLED;
  if (routing !== undefined) {
    record("Flag routing", "ROUTING_DISABLED", "mandatory", true, false,
      `⛔ DEPRECATA — NON deve essere impostata in produzione (valore attuale: "${routing}"). ` +
      `Se presente bake nel container e bypassa il toggle admin (Hub Routing) rendendolo inoperante. ` +
      `Rimuoverla dai Secrets. Il routing si gestisce da Admin → Hub Routing → kill-switch.`);
  } else {
    record("Flag routing", "ROUTING_DISABLED", "flag", false, null,
      "Non impostata (corretto) — routing gestito dal pannello admin → Hub Routing");
  }

  const coord = process.env.COORDINATOR_DISABLED;
  record("Flag coordinator", "COORDINATOR_DISABLED", "flag", !!coord, null,
    coord ? `Disabilitato (valore: "${coord}")` : "Non impostato — coordinator ABILITATO");
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport() {
  const RESET = "\x1b[0m";
  const GREEN = "\x1b[32m";
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";
  const CYAN = "\x1b[36m";
  const BOLD = "\x1b[1m";
  const DIM = "\x1b[2m";

  console.log(`\n${BOLD}════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  BikerLink — Audit Credenziali${RESET}`);
  console.log(`${DIM}  ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}════════════════════════════════════════════════════════════${RESET}\n`);

  let ok = 0, warn = 0, fail = 0;

  for (const r of results) {
    let icon: string;
    let color: string;

    if (r.required === "flag") {
      icon = "🔧";
      color = CYAN;
      warn++;
    } else if (!r.present && r.required === "mandatory") {
      icon = "❌";
      color = RED;
      fail++;
    } else if (!r.present && r.required === "optional") {
      icon = "ℹ️ ";
      color = CYAN;
      warn++;
    } else if (r.valid === true) {
      icon = "✅";
      color = GREEN;
      ok++;
    } else if (r.valid === false) {
      icon = "❌";
      color = RED;
      fail++;
    } else {
      icon = "⚠️ ";
      color = YELLOW;
      warn++;
    }

    const reqLabel = r.required === "mandatory" ? " [obbligatoria]" : r.required === "optional" ? " [opzionale]" : " [flag]";
    console.log(`${icon} ${color}${BOLD}${r.service}${RESET}${DIM}${reqLabel}${RESET}`);
    console.log(`   ${DIM}${r.credential}${RESET}`);
    console.log(`   ${r.note}`);
    console.log();
  }

  console.log(`${BOLD}────────────────────────────────────────────────────────────${RESET}`);
  console.log(`${GREEN}✅ OK: ${ok}${RESET}   ${YELLOW}⚠️  Info/Warning: ${warn}${RESET}   ${RED}❌ Errori: ${fail}${RESET}`);
  console.log(`${BOLD}════════════════════════════════════════════════════════════${RESET}\n`);

  if (fail > 0) process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Validazione credenziali in corso...\n");
  await Promise.all([
    checkDatabase(),
    checkOpenAI(),
    checkGemini(),
    checkOllama(),
    checkGraphHopper(),
    checkTomTom(),
    checkMapbox(),
    checkCloudflare(),
    checkR2(),
    checkPhoton(),
    checkGmail(),
    checkLastFm(),
    checkRedis(),
    checkTileProviders(),
  ]);
  checkValhalla();
  checkSecurity();
  checkMonitoringAndFlags();
  printReport();
}

main().catch((e) => { console.error(e); process.exit(1); });
