#!/usr/bin/env node
/**
 * BikerLink — Kalman Filter Service (self-hosted, ThinkCentre)
 *
 * Piccolo servizio Node che mantiene per-utente lo stato di un filtro di Kalman
 * (libreria `kalman-filter`, piercus, MIT) per stimare nel tempo il *bias* di
 * velocità e heading a partire dagli scostamenti osservati fra dead-reckoning
 * e GPS. Usato dal motore di correzione DR/GPS (Task #47) dell'app principale.
 *
 * Esposizione: NON ha una regola ingress Cloudflare dedicata. È raggiunto SOLO
 * in localhost dal `thinkcentre-agent` (già pubblico su tc.biker-link.net), che
 * fa da reverse-proxy per il path `/kalman/*` riusando la sua autenticazione
 * (X-Agent-Token + Cloudflare Access). Di conseguenza questo servizio bind solo
 * su 127.0.0.1 e non richiede auth propria.
 *
 * Zero dipendenze oltre a `kalman-filter`. Persistenza locale su file JSON
 * (debounced) così lo stato sopravvive a un restart pm2.
 *
 * Env:
 *   PORT              porta di ascolto (default 9210)
 *   BIND_HOST         host di bind (default 127.0.0.1 — non esporre in LAN)
 *   STATE_FILE        path del file di persistenza (default ./data/state.json)
 *   MAX_USERS         tetto di utenti in memoria (default 50000, LRU-evict)
 *   KALMAN_*          override dei parametri del modello (vedi lib/kalman-model)
 *
 * Avvio:
 *   node server.js
 *   # oppure con pm2 (vedi README.md / ecosystem.config.js)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { step, DEFAULTS } = require("./lib/kalman-model");

const PORT = parseInt(process.env.PORT || "9210", 10);
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "data", "state.json");
const MAX_USERS = parseInt(process.env.MAX_USERS || "50000", 10);
const MAX_BODY_BYTES = 64 * 1024;

// Override parametri modello via env KALMAN_<NOME>
const cfgOverride = {};
for (const key of Object.keys(DEFAULTS)) {
  const envName = `KALMAN_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
  const v = process.env[envName];
  if (v !== undefined && v !== "" && Number.isFinite(Number(v))) cfgOverride[key] = Number(v);
}

const SERVICE = { name: "bikerlink-kalman", version: "1.0.0" };

// ── Stato per-utente ────────────────────────────────────────────────────────
/** @type {Map<string, {state:object, biases:object, sampleCount:number, updatedAt:number, lastObservation:object}>} */
const users = new Map();

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.users) {
      for (const [uid, rec] of Object.entries(obj.users)) users.set(uid, rec);
      console.log(`[kalman] Stato caricato: ${users.size} utenti da ${STATE_FILE}`);
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[kalman] Impossibile caricare lo stato: ${err.message}`);
  }
}

let saveTimer = null;
let saving = false;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(persistState, 2000);
}
function persistState() {
  saveTimer = null;
  if (saving) return;
  saving = true;
  const snapshot = { savedAt: Date.now(), users: Object.fromEntries(users) };
  const tmp = `${STATE_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.warn(`[kalman] Salvataggio stato fallito: ${err.message}`);
  } finally {
    saving = false;
  }
}

/** Evizione LRU (per updatedAt) quando si supera MAX_USERS. */
function evictIfNeeded() {
  if (users.size <= MAX_USERS) return;
  const sorted = [...users.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const toDrop = users.size - MAX_USERS;
  for (let i = 0; i < toDrop; i++) users.delete(sorted[i][0]);
}

// ── Helpers HTTP ────────────────────────────────────────────────────────────
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function publicRecord(rec) {
  if (!rec) return null;
  return {
    biases: rec.biases,
    sampleCount: rec.sampleCount,
    updatedAt: rec.updatedAt,
    lastObservation: rec.lastObservation,
    filterIndex: rec.state ? rec.state.index : null,
  };
}

function validNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Valida il payload di /update. Ritorna { ok, error?, dr?, gps?, accuracy?, timestamp? } */
function validateObservation(body) {
  const userId = body && body.userId;
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 128) {
    return { ok: false, error: "userId mancante o non valido (string 1..128)" };
  }
  const dr = body.dr;
  const gps = body.gps;
  if (!dr || !gps || typeof dr !== "object" || typeof gps !== "object") {
    return { ok: false, error: "dr e gps sono obbligatori (oggetti con speed/heading)" };
  }
  if (!validNum(dr.speed) || !validNum(dr.heading)) {
    return { ok: false, error: "dr.speed e dr.heading devono essere numeri finiti" };
  }
  if (!validNum(gps.speed) || !validNum(gps.heading)) {
    return { ok: false, error: "gps.speed e gps.heading devono essere numeri finiti" };
  }
  const accuracy = validNum(body.accuracy) ? body.accuracy : null;
  const timestamp = validNum(body.timestamp) ? body.timestamp : Date.now();
  return { ok: true, userId, dr, gps, accuracy, timestamp };
}

// ── Router ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${BIND_HOST}:${PORT}`);
  const method = (req.method || "GET").toUpperCase();
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  try {
    // Health
    if (method === "GET" && (pathname === "/" || pathname === "/health")) {
      return sendJson(res, 200, {
        ok: true,
        service: SERVICE.name,
        version: SERVICE.version,
        users: users.size,
        uptimeSec: Math.floor(process.uptime()),
      });
    }

    // Stato corrente di un utente
    if (method === "GET" && pathname.startsWith("/state/")) {
      const userId = decodeURIComponent(pathname.slice("/state/".length));
      const rec = users.get(userId);
      if (!rec) return sendJson(res, 404, { ok: false, error: "utente sconosciuto", userId });
      return sendJson(res, 200, { ok: true, userId, ...publicRecord(rec) });
    }

    // Nuovo campione di osservazione → step del filtro
    if (method === "POST" && pathname === "/update") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
      const v = validateObservation(body);
      if (!v.ok) return sendJson(res, 400, { ok: false, error: v.error });

      const prev = users.get(v.userId);
      const prevState = prev ? prev.state : null;

      let result;
      try {
        result = step(prevState, v.dr, v.gps, v.accuracy, cfgOverride);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: `errore filtro: ${err.message}` });
      }

      const rec = {
        state: result.state,
        biases: result.biases,
        sampleCount: (prev ? prev.sampleCount : 0) + 1,
        updatedAt: v.timestamp,
        lastObservation: { ...result.observation, accuracy: v.accuracy, accuracyScale: result.accuracyScale },
      };
      users.set(v.userId, rec);
      evictIfNeeded();
      scheduleSave();

      return sendJson(res, 200, { ok: true, userId: v.userId, ...publicRecord(rec) });
    }

    // Reset del filtro di un utente
    if (method === "POST" && pathname.startsWith("/reset/")) {
      const userId = decodeURIComponent(pathname.slice("/reset/".length));
      const existed = users.delete(userId);
      scheduleSave();
      return sendJson(res, 200, { ok: true, userId, reset: existed });
    }

    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
});

loadState();

server.listen(PORT, BIND_HOST, () => {
  console.log(`[kalman] In ascolto su http://${BIND_HOST}:${PORT} (bind localhost — proxy via thinkcentre-agent)`);
  console.log(`[kalman] GET  /health          → stato servizio`);
  console.log(`[kalman] GET  /state/:userId   → stato filtro utente`);
  console.log(`[kalman] POST /update          → { userId, dr, gps, accuracy, timestamp } → bias aggiornati`);
  console.log(`[kalman] POST /reset/:userId   → azzera il filtro utente`);
  if (Object.keys(cfgOverride).length) console.log(`[kalman] Override modello:`, cfgOverride);
});

server.on("error", (err) => {
  console.error("[kalman] ERRORE:", err.message);
  process.exit(1);
});

// Persistenza su shutdown pulito
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    persistState();
    process.exit(0);
  });
}
