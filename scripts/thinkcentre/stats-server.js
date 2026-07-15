#!/usr/bin/env node
/**
 * BikerLink ThinkCentre — Stats Server
 * Serve GET /sys-metrics su porta 9199.
 * Solo moduli built-in Node.js (http, fs, child_process).
 *
 * Metriche:
 *  - CPU/GPU temp: output `sensors`
 *  - RAM/Swap:     /proc/meminfo
 *  - CPU load:     /proc/loadavg
 *  - Rete:         /proc/net/dev  delta su 1s  → KB/s
 *  - I/O disco:    /proc/diskstats delta su 1s → KB/s
 *  - Spazio disco: fs.statfsSync per / e /home (se mount separato)
 *
 * Avvio: node ~/bikerlink-monitor/stats-server.js
 * Install: bash scripts/thinkcentre/monitor-install.sh
 */

"use strict";

const http = require("http");
const fs = require("fs");
const { execSync } = require("child_process");

const PORT = 9199;
const TOKEN = process.env.STATS_TOKEN ?? "";

// ── helpers ────────────────────────────────────────────────────────────────

function readFile(path) {
  try { return fs.readFileSync(path, "utf8"); } catch { return ""; }
}

// ── CPU/GPU temperatura ─────────────────────────────────────────────────────

function parseSensors() {
  let output = "";
  try { output = execSync("sensors 2>/dev/null", { timeout: 3000 }).toString(); } catch { return { cpuTempC: null, gpuTempC: null }; }

  let cpuTempC = null;
  let gpuTempC = null;

  for (const line of output.split("\n")) {
    const lower = line.toLowerCase();
    // CPU: cerca Core 0, Package id 0, Tctl, cpu_temp
    if (cpuTempC === null && /core\s*0|package\s*id\s*0|tctl|cpu_temp|cpu_thermal/i.test(line)) {
      const m = line.match(/[+-]?(\d+(?:\.\d+)?)\s*°?C/i);
      if (m) cpuTempC = parseFloat(m[1]);
    }
    // GPU: cerca edge, gpu, amdgpu, nvidia
    if (gpuTempC === null && /\bedge\b|amdgpu|nvidia|gpu/i.test(lower)) {
      const m = line.match(/[+-]?(\d+(?:\.\d+)?)\s*°?C/i);
      if (m) gpuTempC = parseFloat(m[1]);
    }
  }

  // Fallback: qualsiasi linea con °C se non trovato ancora
  if (cpuTempC === null) {
    for (const line of output.split("\n")) {
      const m = line.match(/[+-]?(\d+(?:\.\d+)?)\s*°?C/i);
      if (m) { cpuTempC = parseFloat(m[1]); break; }
    }
  }

  return { cpuTempC, gpuTempC };
}

// ── GPU: utilizzo, VRAM, temperatura (nvidia-smi) ───────────────────────────
// Degrada in modo pulito se nvidia-smi non è installato / nessuna GPU NVIDIA:
// tutti i campi restano null e il frontend semplicemente non li mostra.
function parseGpu() {
  let output = "";
  try {
    output = execSync(
      "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name --format=csv,noheader,nounits 2>/dev/null",
      { timeout: 3000 },
    ).toString().trim();
  } catch {
    return { gpuUtilPct: null, vramUsedMb: null, vramTotalMb: null, gpuTempC: null, gpuName: null };
  }
  const line = output.split("\n")[0] ?? "";
  const cols = line.split(",").map((s) => s.trim());
  if (cols.length < 4) {
    return { gpuUtilPct: null, vramUsedMb: null, vramTotalMb: null, gpuTempC: null, gpuName: null };
  }
  const num = (v) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : null);
  return {
    gpuUtilPct:  num(cols[0]),
    vramUsedMb:  num(cols[1]),
    vramTotalMb: num(cols[2]),
    gpuTempC:    num(cols[3]),
    // il nome può teoricamente contenere virgole → riunisci il resto
    gpuName:     cols.slice(4).join(",").trim() || null,
  };
}

// ── RAM/Swap ──────────────────────────────────────────────────────────────

function parseMeminfo() {
  const raw = readFile("/proc/meminfo");
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
    return m ? parseInt(m[1], 10) : 0;
  };
  const memTotalKb  = get("MemTotal");
  const memAvailKb  = get("MemAvailable");
  const swapTotalKb = get("SwapTotal");
  const swapFreeKb  = get("SwapFree");

  return {
    ramTotalMb:  Math.round(memTotalKb  / 1024),
    ramUsedMb:   Math.round((memTotalKb - memAvailKb) / 1024),
    swapTotalMb: Math.round(swapTotalKb / 1024),
    swapUsedMb:  Math.round((swapTotalKb - swapFreeKb) / 1024),
  };
}

// ── CPU load ──────────────────────────────────────────────────────────────

function parseLoadavg() {
  const raw = readFile("/proc/loadavg");
  const parts = raw.trim().split(" ");
  return {
    loadAvg1:  parseFloat(parts[0]) || 0,
    loadAvg5:  parseFloat(parts[1]) || 0,
  };
}

// ── Rete (/proc/net/dev) ──────────────────────────────────────────────────

function parseNetDev() {
  const raw = readFile("/proc/net/dev");
  const lines = raw.split("\n").slice(2); // salta header
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    const iface = (cols[0] ?? "").replace(":", "");
    if (!iface || iface === "lo" || iface.startsWith("veth") || iface.startsWith("docker") || iface.startsWith("br-")) continue;
    return {
      iface,
      rxBytes: parseInt(cols[1], 10) || 0,
      txBytes: parseInt(cols[9], 10) || 0,
    };
  }
  return { iface: "", rxBytes: 0, txBytes: 0 };
}

// ── I/O disco (/proc/diskstats) ───────────────────────────────────────────

function parseDiskStats() {
  const raw = readFile("/proc/diskstats");
  for (const line of raw.split("\n")) {
    const cols = line.trim().split(/\s+/);
    const dev = cols[2] ?? "";
    // primo disco fisico: sda/nvme0n1/vda — no dm-, loop, sda1 ecc.
    if (/^(sd[a-z]|nvme\d+n\d+|vda|hda)$/.test(dev)) {
      return {
        dev,
        sectorsRead:    parseInt(cols[5],  10) || 0,
        sectorsWritten: parseInt(cols[9],  10) || 0,
      };
    }
  }
  return { dev: "", sectorsRead: 0, sectorsWritten: 0 };
}

// ── Spazio disco ──────────────────────────────────────────────────────────

function diskMounts() {
  const mounts = [];
  for (const path of ["/", "/home"]) {
    try {
      const st = fs.statfsSync(path);
      const totalGb = parseFloat(((st.blocks * st.bsize) / 1e9).toFixed(1));
      const freeGb  = parseFloat(((st.bfree  * st.bsize) / 1e9).toFixed(1));
      const usedGb  = parseFloat((totalGb - freeGb).toFixed(1));
      const usedPct = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;
      mounts.push({ path, usedGb, totalGb, usedPct });
    } catch { /* mount non esiste */ }
  }
  // rimuovi /home se stesso dispositivo di / (stesso totalGb ≈ stessa partizione)
  if (mounts.length === 2 && Math.abs(mounts[0].totalGb - mounts[1].totalGb) < 1) {
    return [mounts[0]];
  }
  return mounts;
}

// ── Campionamento con delta 1s ─────────────────────────────────────────────

function sampleWithDelta() {
  return new Promise((resolve) => {
    const net1  = parseNetDev();
    const disk1 = parseDiskStats();

    setTimeout(() => {
      const net2  = parseNetDev();
      const disk2 = parseDiskStats();

      const netRxKBs   = Math.max(0, Math.round((net2.rxBytes - net1.rxBytes) / 1024));
      const netTxKBs   = Math.max(0, Math.round((net2.txBytes - net1.txBytes) / 1024));

      // 1 settore = 512 byte
      const diskReadKBs  = Math.max(0, Math.round(((disk2.sectorsRead    - disk1.sectorsRead)    * 512) / 1024));
      const diskWriteKBs = Math.max(0, Math.round(((disk2.sectorsWritten - disk1.sectorsWritten) * 512) / 1024));

      resolve({ netRxKBs, netTxKBs, diskReadKBs, diskWriteKBs });
    }, 1000);
  });
}

// ── Repo drift check (~/bikerlink vs origin/main) ─────────────────────────
// Verifica se il checkout locale dell'app è allineato con origin/main sui
// file critici per i build dei modelli custom Ollama.
// Restituisce { ok, driftDetected, behind, driftedFiles, checkedAt, error? }.

const REPO_PATH = (process.env.HOME ?? "/root") + "/bikerlink";
const DRIFT_BRANCH = "main";
const DRIFT_TRACKED = [
  "scripts/setup-ollama-server.sh",
  "scripts/ollama-modelfile/BikerLink-Bowie.Modelfile",
  "scripts/ollama-modelfile/BikerLink-Horus.Modelfile",
];

function checkRepoDrift() {
  // Verifica che sia un repo git valido.
  try {
    execSync(`git -C "${REPO_PATH}" rev-parse --show-toplevel`, { timeout: 3_000, stdio: "pipe" });
  } catch {
    return { ok: false, driftDetected: false, behind: null, driftedFiles: [], checkedAt: new Date().toISOString(), error: "not-a-repo" };
  }

  // Fetch remoto con timeout generoso; se fallisce, si usa lo stato in cache.
  let fetchError = null;
  try {
    execSync(`git -C "${REPO_PATH}" fetch origin ${DRIFT_BRANCH} --quiet 2>/dev/null`, { timeout: 15_000, stdio: "pipe" });
  } catch (e) {
    fetchError = "fetch-failed";
    void e;
  }

  // Commit di distanza.
  let behind = null;
  try {
    const raw = execSync(
      `git -C "${REPO_PATH}" rev-list --count HEAD..origin/${DRIFT_BRANCH}`,
      { timeout: 3_000, stdio: "pipe" },
    ).toString().trim();
    behind = parseInt(raw, 10);
    if (Number.isNaN(behind)) behind = null;
  } catch { /* ignora */ }

  // Confronto file di build: exit != 0 significa "differisce da origin".
  const driftedFiles = [];
  for (const f of DRIFT_TRACKED) {
    try {
      execSync(
        `git -C "${REPO_PATH}" diff --quiet "origin/${DRIFT_BRANCH}" -- "${f}"`,
        { timeout: 3_000, stdio: "pipe" },
      );
      // exit 0 → allineato
    } catch {
      driftedFiles.push(f);
    }
  }

  const driftDetected = driftedFiles.length > 0;
  return {
    ok: !driftDetected,
    driftDetected,
    behind,
    driftedFiles,
    checkedAt: new Date().toISOString(),
    ...(fetchError ? { fetchError } : {}),
  };
}

// ── HTTP server ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Verifica token se configurato
  if (TOKEN) {
    const auth = req.headers["x-agent-token"] ?? "";
    if (auth !== TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  // ── GET /repo-drift ──────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/repo-drift") {
    try {
      const result = checkRepoDrift();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  if (req.method !== "GET" || req.url !== "/sys-metrics") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const [temps, gpu, mem, load, delta] = await Promise.all([
      Promise.resolve(parseSensors()),
      Promise.resolve(parseGpu()),
      Promise.resolve(parseMeminfo()),
      Promise.resolve(parseLoadavg()),
      sampleWithDelta(),
    ]);

    const payload = {
      cpuTempC:     temps.cpuTempC,
      // nvidia-smi è più affidabile di `sensors` per la GPU: usalo come primaria.
      gpuTempC:     gpu.gpuTempC ?? temps.gpuTempC,
      gpuUtilPct:   gpu.gpuUtilPct,
      vramUsedMb:   gpu.vramUsedMb,
      vramTotalMb:  gpu.vramTotalMb,
      gpuName:      gpu.gpuName,
      loadAvg1:     load.loadAvg1,
      loadAvg5:     load.loadAvg5,
      ramUsedMb:    mem.ramUsedMb,
      ramTotalMb:   mem.ramTotalMb,
      swapUsedMb:   mem.swapUsedMb,
      swapTotalMb:  mem.swapTotalMb,
      netRxKBs:     delta.netRxKBs,
      netTxKBs:     delta.netTxKBs,
      diskReadKBs:  delta.diskReadKBs,
      diskWriteKBs: delta.diskWriteKBs,
      diskMounts:   diskMounts(),
      sampledAt:    new Date().toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[stats-server] In ascolto su porta ${PORT}`);
});

server.on("error", (err) => {
  console.error("[stats-server] Errore:", err.message);
  process.exit(1);
});
