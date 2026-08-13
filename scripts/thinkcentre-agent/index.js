#!/usr/bin/env node
/**
 * ThinkCentre Metrics Agent
 * Lightweight HTTP server for the ThinkCentre system metrics.
 *
 * Endpoint:
 *   GET /sys-metrics — CPU, RAM, uptime del mini-PC
 *
 * Avvio: node index.js
 * Porta: 9101 (override: PORT=xxxx node index.js)
 *
 * Requisiti: Node.js >= 16, Linux (/proc filesystem).
 */

const http = require("http");
const fs = require("fs");

const PORT = parseInt(process.env.PORT || "9101", 10);

function readProc(path) {
  try { return fs.readFileSync(path, "utf8"); } catch { return ""; }
}

function getMetrics() {
  const loadAvg = readProc("/proc/loadavg").trim().split(" ");
  const uptime = parseFloat(readProc("/proc/uptime").split(" ")[0] || "0");
  const cores = (readProc("/proc/cpuinfo").match(/^processor\s*:/gm) || []).length || 1;

  const memLines = Object.fromEntries(
    readProc("/proc/meminfo").split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.split(":");
        return [key.trim(), parseInt(value, 10) * 1024];
      }),
  );
  const totalMb = Math.round((memLines.MemTotal || 0) / 1048576);
  const freeMem = (memLines.MemFree || 0) + (memLines.Buffers || 0) + (memLines.Cached || 0);
  const usedMb = Math.round(((memLines.MemTotal || 0) - freeMem) / 1048576);

  return {
    cpu: {
      loadAvg1: parseFloat(loadAvg[0] || "0"),
      loadAvg5: parseFloat(loadAvg[1] || "0"),
      loadAvg15: parseFloat(loadAvg[2] || "0"),
      cores,
    },
    memory: {
      totalMb,
      usedMb,
      usedPercent: totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0,
    },
    uptimeSec: Math.floor(uptime),
  };
}

http.createServer((req, res) => {
  if (req.url === "/sys-metrics") {
    try {
      const body = JSON.stringify(getMetrics());
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}).listen(PORT, "0.0.0.0", () => {
  console.log("[thinkcentre-agent] in ascolto su http://0.0.0.0:" + PORT);
  console.log("[thinkcentre-agent] endpoint: /sys-metrics");
});
