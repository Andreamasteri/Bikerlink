#!/usr/bin/env node
/**
 * BikerLink — ThinkCentre Agent
 *
 * Agente leggero che espone le metriche hardware del server di casa
 * al pannello admin di BikerLink via GET /sys-metrics.
 *
 * Zero dipendenze npm — solo moduli Node.js built-in.
 *
 * Avvio rapido:
 *   node server.js
 *
 * Con token di autenticazione:
 *   AGENT_TOKEN=segreto node server.js
 *
 * Con pm2 (avvio automatico al boot):
 *   pm2 start server.js --name bikerlink-agent
 *   pm2 save
 *   pm2 startup
 *
 * Variabili d'ambiente:
 *   PORT          — porta di ascolto (default: 9101)
 *   AGENT_TOKEN   — se impostato, richiede header "X-Agent-Token: <token>"
 *   DISK_PATH     — path del disco da monitorare (default: /)
 */

const http = require("http");
const os   = require("os");
const { execSync } = require("child_process");

const PORT        = parseInt(process.env.PORT || "9101", 10);
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const DISK_PATH   = process.env.DISK_PATH   || "/";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCpuMetrics() {
  const load  = os.loadavg();           // [1m, 5m, 15m]
  const cores = os.cpus().length;
  return {
    loadAvg1:  parseFloat(load[0].toFixed(2)),
    loadAvg5:  parseFloat(load[1].toFixed(2)),
    loadAvg15: parseFloat(load[2].toFixed(2)),
    cores,
  };
}

function getMemoryMetrics() {
  const totalBytes = os.totalmem();
  const freeBytes  = os.freemem();
  const usedBytes  = totalBytes - freeBytes;
  const totalMb    = Math.round(totalBytes / 1024 / 1024);
  const usedMb     = Math.round(usedBytes  / 1024 / 1024);
  const freeMb     = Math.round(freeBytes  / 1024 / 1024);
  const usedPercent = Math.round((usedBytes / totalBytes) * 100);
  return { totalMb, usedMb, freeMb, usedPercent };
}

function getDiskMetrics(path) {
  try {
    // df -B1 restituisce tutto in byte; parseiamo la riga del path richiesto
    const out = execSync(`df -B1 "${path}" 2>/dev/null`, { timeout: 3000 })
      .toString()
      .trim()
      .split("\n");
    // Riga 0 = intestazione, riga 1 = dati
    if (out.length < 2) return null;
    const cols = out[1].split(/\s+/);
    // cols: Filesystem  1B-blocks  Used  Available  Use%  Mounted
    const totalBytes = parseInt(cols[1], 10);
    const usedBytes  = parseInt(cols[2], 10);
    const freeBytes  = parseInt(cols[3], 10);
    if (isNaN(totalBytes) || totalBytes === 0) return null;
    return {
      totalGb:    parseFloat((totalBytes / 1e9).toFixed(1)),
      usedGb:     parseFloat((usedBytes  / 1e9).toFixed(1)),
      freeGb:     parseFloat((freeBytes  / 1e9).toFixed(1)),
      usedPercent: Math.round((usedBytes / totalBytes) * 100),
    };
  } catch {
    return null;
  }
}

function getUptimeSec() {
  return Math.floor(os.uptime());
}

function buildMetrics() {
  return {
    cpu:      getCpuMetrics(),
    memory:   getMemoryMetrics(),
    disk:     getDiskMetrics(DISK_PATH),
    uptimeSec: getUptimeSec(),
    checkedAt: Date.now(),
  };
}

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method.toUpperCase();

  // Auth
  if (AGENT_TOKEN) {
    const tok = req.headers["x-agent-token"] || url.searchParams.get("token") || "";
    if (tok !== AGENT_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Health ping
  if (method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, agent: "bikerlink-thinkcentre" }));
    return;
  }

  // Metriche
  if (method === "GET" && url.pathname === "/sys-metrics") {
    try {
      const data = buildMetrics();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  const tokenInfo = AGENT_TOKEN ? "auth ON (X-Agent-Token)" : "auth OFF (nessun token)";
  console.log(`[bikerlink-agent] In ascolto su http://0.0.0.0:${PORT} — ${tokenInfo}`);
  console.log(`[bikerlink-agent] /sys-metrics   → CPU + RAM + disco (${DISK_PATH}) + uptime`);
});

server.on("error", (err) => {
  console.error("[bikerlink-agent] ERRORE:", err.message);
  process.exit(1);
});
