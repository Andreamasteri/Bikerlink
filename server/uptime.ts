import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { db } from "./db";
import { serverRestarts } from "@shared/db";

export const SERVER_START_TIME = Date.now();

export const uptimeState = {
  metroStartTime: 0,
  metroLastSeenAt: 0,
  metroOnline: false,
  frontendStartTime: 0,
};

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const UPTIME_LOG = path.join(LOGS_DIR, "uptime-resets.log");
const STATE_FILE = path.join(LOGS_DIR, "backend-uptime-state.json");

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function appendUptimeLog(line: string) {
  try {
    ensureLogsDir();
    const ts = new Date().toISOString();
    fs.appendFileSync(UPTIME_LOG, `${ts} ${line}\n`, "utf-8");
  } catch (err) { console.warn("[uptime] Failed to write uptime log:", err); }
}

interface UptimeStateFile {
  startedAt: number;
  // true se l'ultimo processo è stato chiuso in modo pulito (SIGTERM/SIGINT
  // gestiti da gracefulShutdown). Al boot successivo questo distingue un
  // riavvio voluto da un crash/riavvio inatteso.
  cleanShutdown?: boolean;
}

function readState(): UptimeStateFile | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.startedAt === "number") return parsed as UptimeStateFile;
    return null;
  } catch {
    return null;
  }
}

function writeState(state: UptimeStateFile) {
  try {
    ensureLogsDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
  } catch (err) { console.warn("[uptime] Failed to write uptime state file:", err); }
}

// Chiamata (sincrona) dal gracefulShutdown alla ricezione di SIGTERM/SIGINT:
// marca lo state file come "spegnimento pulito" così che al boot successivo il
// riavvio sia classificato come intenzionale e non come crash.
export function markCleanShutdown(): void {
  const state = readState();
  if (state) {
    writeState({ ...state, cleanShutdown: true });
  }
}

export function initUptimeTracking() {
  const now = SERVER_START_TIME;
  const prev = readState();

  let reason: "cold_start" | "restart" | "crash";
  if (prev === null) {
    appendUptimeLog("BACKEND UP (cold start)");
    reason = "cold_start";
  } else {
    const prevUptime = formatDuration(now - prev.startedAt);
    if (prev.cleanShutdown) {
      appendUptimeLog(`BACKEND RESTART (intenzionale) — previous uptime: ${prevUptime}`);
      reason = "restart";
    } else {
      appendUptimeLog(`BACKEND CRASH/RIAVVIO INATTESO — previous uptime: ${prevUptime}`);
      reason = "crash";
    }
  }

  // Reset del marker: il processo corrente è considerato "in crash" finché un
  // gracefulShutdown non riscrive cleanShutdown=true.
  writeState({ startedAt: now, cleanShutdown: false });

  db.insert(serverRestarts).values({ startedAt: new Date(now), reason }).catch((err) => {
    console.warn("[uptime] Could not record server restart:", err);
  });
}

let _metroInterval: ReturnType<typeof setInterval> | null = null;

export function stopMetroMonitor(): void {
  if (_metroInterval !== null) {
    clearInterval(_metroInterval);
    _metroInterval = null;
  }
}

export function startMetroMonitor() {
  const METRO_PORT = 8081;
  const INTERVAL_MS = 30_000;

  const checkMetro = () => {
    const req = http.get(
      { hostname: "localhost", port: METRO_PORT, path: "/status", timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          const isRunning = body.includes("packager-status:running");
          if (isRunning) {
            uptimeState.metroLastSeenAt = Date.now();
          }
          if (isRunning && !uptimeState.metroOnline) {
            uptimeState.metroStartTime = Date.now();
            uptimeState.metroOnline = true;
            if (uptimeState.frontendStartTime === 0) {
              uptimeState.frontendStartTime = uptimeState.metroStartTime;
            }
            appendUptimeLog("METRO UP");
          } else if (!isRunning && uptimeState.metroOnline) {
            const uptime = uptimeState.metroStartTime > 0
              ? formatDuration(Date.now() - uptimeState.metroStartTime)
              : "unknown";
            uptimeState.metroOnline = false;
            appendUptimeLog(`METRO DOWN — uptime: ${uptime}`);
          }
        });
      }
    );
    req.on("error", () => {
      if (uptimeState.metroOnline) {
        const uptime = uptimeState.metroStartTime > 0
          ? formatDuration(Date.now() - uptimeState.metroStartTime)
          : "unknown";
        uptimeState.metroOnline = false;
        appendUptimeLog(`METRO DOWN — uptime: ${uptime}`);
      }
    });
    req.on("timeout", () => { req.destroy(); });
  };

  _metroInterval = setInterval(checkMetro, INTERVAL_MS);
  setTimeout(checkMetro, 5000);
}
