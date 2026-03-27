import * as fs from "fs";
import * as path from "path";
import * as http from "http";

export const SERVER_START_TIME = Date.now();

export const uptimeState = {
  metroStartTime: 0,
  metroOnline: false,
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
  } catch {}
}

function readLastStartTime(): number | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.startedAt === "number") return parsed.startedAt;
    return null;
  } catch {
    return null;
  }
}

function writeStartTime(ts: number) {
  try {
    ensureLogsDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ startedAt: ts }), "utf-8");
  } catch {}
}

export function initUptimeTracking() {
  const now = SERVER_START_TIME;
  const lastStart = readLastStartTime();

  if (lastStart !== null) {
    const prevUptime = formatDuration(now - lastStart);
    appendUptimeLog(`BACKEND RESTART — previous uptime: ${prevUptime}`);
  } else {
    appendUptimeLog("BACKEND UP (cold start)");
  }

  writeStartTime(now);
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
          if (isRunning && !uptimeState.metroOnline) {
            uptimeState.metroStartTime = Date.now();
            uptimeState.metroOnline = true;
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

  setInterval(checkMetro, INTERVAL_MS);
  setTimeout(checkMetro, 5000);
}
