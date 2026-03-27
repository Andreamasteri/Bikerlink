import * as fs from "fs";
import * as path from "path";
import * as http from "http";

export const SERVER_START_TIME = Date.now();

export const uptimeState = {
  metroStartTime: 0,
  metroOnline: false,
};

const UPTIME_LOG = path.resolve(process.cwd(), "logs", "uptime-resets.log");

function ensureLogsDir() {
  const logsDir = path.dirname(UPTIME_LOG);
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function appendUptimeLog(line: string) {
  try {
    ensureLogsDir();
    const ts = new Date().toISOString();
    fs.appendFileSync(UPTIME_LOG, `${ts} ${line}\n`, "utf-8");
  } catch {}
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
