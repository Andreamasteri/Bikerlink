require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 4405;
const GATE_TOKEN = process.env.HUB_GATE_TOKEN || "";
const SHARED_ROOT = process.env.SHARED_ROOT || path.join(os.homedir(), "agent-shared");

const app = express();
app.use(express.json({ limit: "5mb" }));

function requireGateToken(req, res, next) {
  if (!GATE_TOKEN) {
    return res.status(500).json({ error: "HUB_GATE_TOKEN not configured on server" });
  }
  const header = req.header("X-Hub-Gate-Token");
  if (header !== GATE_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function resolveSafePath(relPath) {
  const rel = (relPath || "").replace(/^\/+/, "");
  const resolved = path.resolve(SHARED_ROOT, rel);
  if (resolved !== SHARED_ROOT && !resolved.startsWith(SHARED_ROOT + path.sep)) {
    throw new Error("path escapes shared root");
  }
  return resolved;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ai-hub", sharedRoot: SHARED_ROOT });
});

const KNOWN_TOOLS = [
  "web_search", "github_read", "remember_note", "read_blog",
  "typecheck_repo", "lint_repo", "search_code", "git_log", "architect", "sonar_scan",
  "search_manual", "save_file", "read_file", "list_files", "check_vram_usage", "read_pdf", "write_pdf"
];
app.get("/tools", requireGateToken, (req, res) => {
  res.json({ tools: KNOWN_TOOLS, note: "registro completo dei tool esistenti nell'ecosistema Horus/Bowie; l'attivazione per-agente e' da definire (fase successiva)." });
});

app.post("/files/write", requireGateToken, (req, res) => {
  try {
    const { path: relPath, content } = req.body || {};
    if (!relPath || typeof content !== "string") {
      return res.status(400).json({ error: "path and content (string) are required" });
    }
    const target = resolveSafePath(relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    res.json({ ok: true, path: path.relative(SHARED_ROOT, target) });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.get("/files/read", requireGateToken, (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: "path query param required" });
    const target = resolveSafePath(String(relPath));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return res.status(404).json({ error: "file not found" });
    }
    const content = fs.readFileSync(target, "utf8");
    res.json({ ok: true, path: path.relative(SHARED_ROOT, target), content });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.get("/files/list", requireGateToken, (req, res) => {
  try {
    const relPath = req.query.path || "";
    const target = resolveSafePath(String(relPath));
    if (!fs.existsSync(target)) {
      return res.status(404).json({ error: "directory not found" });
    }
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "not a directory" });
    }
    const entries = fs.readdirSync(target, { withFileTypes: true }).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
    }));
    res.json({ ok: true, path: path.relative(SHARED_ROOT, target) || ".", entries });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.get("/files/pdf/read", requireGateToken, async (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: "path query param required" });
    const target = resolveSafePath(String(relPath));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return res.status(404).json({ error: "file not found" });
    }
    const buffer = fs.readFileSync(target);
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    await parser.destroy();
    res.json({
      ok: true,
      path: path.relative(SHARED_ROOT, target),
      text: data.text,
      numPages: data.total,
    });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.post("/files/pdf/write", requireGateToken, async (req, res) => {
  try {
    const { path: relPath, content, title } = req.body || {};
    if (!relPath || typeof content !== "string") {
      return res.status(400).json({ error: "path and content (string) are required" });
    }
    const target = resolveSafePath(relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const margin = 50;
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const maxLineWidth = pageWidth - margin * 2;

    function wrapLine(line) {
      const words = line.split(/\s+/);
      const wrapped = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) > maxLineWidth && current) {
          wrapped.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) wrapped.push(current);
      return wrapped.length ? wrapped : [""];
    }

    const rawLines = content.split(/\r?\n/);
    const lines = rawLines.flatMap(wrapLine);
    const lineHeight = fontSize * 1.4;
    const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);

    for (let i = 0; i < lines.length; i += linesPerPage) {
      const page = doc.addPage([pageWidth, pageHeight]);
      const chunk = lines.slice(i, i + linesPerPage);
      let y = pageHeight - margin;
      if (i === 0 && title) {
        page.drawText(String(title), { x: margin, y, size: fontSize + 3, font, color: rgb(0, 0, 0) });
        y -= lineHeight * 1.5;
      }
      for (const line of chunk) {
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }
    }
    if (lines.length === 0) {
      doc.addPage([pageWidth, pageHeight]);
    }

    const bytes = await doc.save();
    fs.writeFileSync(target, bytes);
    res.json({ ok: true, path: path.relative(SHARED_ROOT, target), pages: doc.getPageCount() });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// --- VRAM monitor (Task #194) ------------------------------------------
//
// Campiona nvidia-smi ogni SAMPLE_INTERVAL_MS, tiene una finestra scorrevole
// di 24h persistita su disco (sopravvive a restart di pm2), ed espone
// GET /vram (gated come il resto dell'hub) con: uso corrente, picco 24h, e
// una ripartizione best-effort per processo che accoppia i PID di
// `nvidia-smi --query-compute-apps` con i modelli residenti da `ollama ps`
// (nessun ID di processo comune tra i due comandi, quindi l'accoppiamento e'
// per ordine di grandezza della memoria — "heuristic-paired", non garantito).
//
// Genera anche un allarme di soglia: quando l'uso supera VRAM_ALERT_THRESHOLD_PCT
// (default 90) invia POST a BIKERBLOG_VRAM_ALERT_URL con lo stesso
// X-Hub-Gate-Token usato per proteggere questo hub (nessun nuovo secret da
// distribuire). Isteresi: l'allarme si disattiva solo quando l'uso scende
// sotto (soglia - VRAM_ALERT_HYSTERESIS_PCT, default 10 punti), per non
// oscillare avanti e indietro vicino alla soglia. Invia il POST solo sulla
// transizione di stato (attivo<->non attivo), mai ad ogni campione, cosi'
// l'endpoint Replit non viene bombardato.
const VRAM_STATE_FILE = path.join(__dirname, "vram-state.json");
const SAMPLE_INTERVAL_MS = Number(process.env.VRAM_SAMPLE_INTERVAL_MS || 45000);
const WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_THRESHOLD_PCT = Number(process.env.VRAM_ALERT_THRESHOLD_PCT || 90);
const ALERT_HYSTERESIS_PCT = Number(process.env.VRAM_ALERT_HYSTERESIS_PCT || 10);
const ALERT_URL = process.env.BIKERBLOG_VRAM_ALERT_URL || "";
const GPU_UTIL_STUCK_THRESHOLD_PCT = Number(process.env.GPU_UTIL_STUCK_THRESHOLD_PCT || 95);
const GPU_UTIL_STUCK_MIN_SAMPLES = Number(process.env.GPU_UTIL_STUCK_MIN_SAMPLES || 7);
const GPU_UTIL_ALERT_URL = process.env.BIKERBLOG_GPU_UTIL_ALERT_URL || ALERT_URL.replace("vram-alert", "gpu-util-alert");

// model -> nome agente per la ripartizione VRAM; sovrascrivibile via env
// VRAM_AGENT_MAP="model1:Nome1,model2:Nome2" senza toccare il codice.
const DEFAULT_AGENT_MAP = {
  "qwen3:4b": "Horus",
  "qwen3:1.7b": "Bowie",
  "granite4:tiny-h": "Quebracho",
  "all-minilm:latest": "Nadir",
  "bikerlink:latest": "Horus",
  "llama3.2:3b": "Bowie",
};
function buildAgentMap() {
  const map = { ...DEFAULT_AGENT_MAP };
  const raw = process.env.VRAM_AGENT_MAP || "";
  raw.split(",").forEach((pair) => {
    const [model, agent] = pair.split(":").map((s) => (s || "").trim());
    if (model && agent) map[model] = agent;
  });
  // Pushed map (from POST /vram/agent-map) overrides env var and defaults.
  Object.assign(map, vramState.pushedAgentMap || {});
  return map;
}

function loadVramState() {
  try {
    const raw = JSON.parse(fs.readFileSync(VRAM_STATE_FILE, "utf8"));
    return {
      samples: Array.isArray(raw.samples) ? raw.samples : [],
      alertActive: Boolean(raw.alertActive),
      alertSince: raw.alertSince || null,
      gpuUtilStuckSamples: Number(raw.gpuUtilStuckSamples || 0),
      gpuUtilAlertActive: Boolean(raw.gpuUtilAlertActive),
      gpuUtilAlertSince: raw.gpuUtilAlertSince || null,
      pushedAgentMap: (raw.pushedAgentMap && typeof raw.pushedAgentMap === 'object' && !Array.isArray(raw.pushedAgentMap)) ? raw.pushedAgentMap : {},
    };
  } catch {
    return { samples: [], alertActive: false, alertSince: null, pushedAgentMap: {} };
  }
}

function saveVramState(state) {
  try {
    fs.writeFileSync(VRAM_STATE_FILE, JSON.stringify(state), "utf8");
  } catch (err) {
    console.error("vram: failed to persist state:", err.message || err);
  }
}

let vramState = loadVramState();

function readGpuStats() {
  const out = execSync(
    "nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits",
    { encoding: "utf8", timeout: 5000 }
  ).trim();
  const [usedMiB, totalMiB, gpuUtil] = out.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(usedMiB) || !Number.isFinite(totalMiB) || totalMiB <= 0) {
    throw new Error(`unexpected nvidia-smi output: "${out}"`);
  }
  return { usedMiB, totalMiB, gpuUtil: Number.isFinite(gpuUtil) ? gpuUtil : null };
}
function readGpuMemory() { return readGpuStats(); }

function readComputeApps() {
  try {
    const out = execSync(
      "nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits",
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => line.split(",").map((s) => s.trim()))
      .filter(([pid, mem]) => pid && Number.isFinite(Number(mem)))
      .map(([pid, mem]) => ({ pid, usedMiB: Number(mem) }));
  } catch {
    return [];
  }
}

function readOllamaModels() {
  try {
    const out = execSync("ollama ps", { encoding: "utf8", timeout: 5000 }).trim();
    const lines = out.split("\n").slice(1); // salta l'header "NAME ID SIZE ..."
    return lines
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Accoppiamento best-effort: nessun ID condiviso tra `nvidia-smi
// --query-compute-apps` e `ollama ps`, quindi ordiniamo entrambe le liste per
// dimensione/ordine e le accoppiamo per posizione. Con un solo processo attivo
// (il caso comune oggi) e' un accoppiamento esatto; con piu' processi resta
// una stima ("heuristic-paired"), segnalata come tale al chiamante.
function buildBreakdown() {
  const apps = readComputeApps().sort((a, b) => b.usedMiB - a.usedMiB);
  const models = readOllamaModels();
  const agentMap = buildAgentMap();
  if (apps.length === 0) return { breakdown: [], confidence: "none" };
  return {
    breakdown: apps.map((app, i) => {
      const model = models[i] || null;
      return {
        pid: app.pid,
        usedMiB: app.usedMiB,
        model,
        agent: model ? agentMap[model] || null : null,
      };
    }),
    confidence: apps.length > 1 ? "heuristic-paired" : "exact",
  };
}

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (err) {
      return reject(err);
    }
    const data = JSON.stringify(body);
    const transport = url.protocol === "http:" ? http : https;
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + (url.search || ""),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "X-Hub-Gate-Token": GATE_TOKEN,
        },
        timeout: 10000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(data);
    req.end();
  });
}

async function sendAlert(active, sample) {
  if (!ALERT_URL) return;
  try {
    const status = await postJson(ALERT_URL, {
      active,
      usedMiB: sample.usedMiB,
      totalMiB: sample.totalMiB,
      pct: sample.pct,
      thresholdPct: ALERT_THRESHOLD_PCT,
      since: vramState.alertSince,
    });
    console.log(`vram: alert POST (active=${active}) -> HTTP ${status}`);
  } catch (err) {
    console.error("vram: failed to send alert:", err.message || err);
  }
}

async function sendGpuUtilAlert(active, gpuUtil) {
  if (!GPU_UTIL_ALERT_URL) return;
  try {
    const status = await postJson(GPU_UTIL_ALERT_URL, {
      active,
      utilPct: gpuUtil,
      thresholdPct: GPU_UTIL_STUCK_THRESHOLD_PCT,
      since: vramState.gpuUtilAlertSince,
    });
    console.log(`gpu-util: alert POST (active=${active}) -> HTTP ${status}`);
  } catch (err) {
    console.error("gpu-util: failed to send alert:", err.message || err);
  }
}

async function sampleOnce() {
  let mem;
  try {
    mem = readGpuStats();
  } catch (err) {
    console.error("vram: nvidia-smi sample failed:", err.message || err);
    return;
  }
  const pct = (mem.usedMiB / mem.totalMiB) * 100;
  const now = Date.now();
  vramState.samples.push({ t: now, usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, gpuUtil: mem.gpuUtil });
  vramState.samples = vramState.samples.filter((s) => now - s.t <= WINDOW_MS);

  // GPU utilization stuck detection
  if (mem.gpuUtil !== null) {
    if (mem.gpuUtil >= GPU_UTIL_STUCK_THRESHOLD_PCT) {
      vramState.gpuUtilStuckSamples = (vramState.gpuUtilStuckSamples || 0) + 1;
    } else {
      vramState.gpuUtilStuckSamples = 0;
    }
    const wasGpuAlertActive = vramState.gpuUtilAlertActive;
    if (!wasGpuAlertActive && vramState.gpuUtilStuckSamples >= GPU_UTIL_STUCK_MIN_SAMPLES) {
      vramState.gpuUtilAlertActive = true;
      vramState.gpuUtilAlertSince = new Date(now).toISOString();
      saveVramState(vramState);
      await sendGpuUtilAlert(true, mem.gpuUtil);
    } else if (wasGpuAlertActive && mem.gpuUtil < GPU_UTIL_STUCK_THRESHOLD_PCT) {
      vramState.gpuUtilAlertActive = false;
      vramState.gpuUtilAlertSince = null;
      vramState.gpuUtilStuckSamples = 0;
      saveVramState(vramState);
      await sendGpuUtilAlert(false, mem.gpuUtil);
    }
  }

  const wasActive = vramState.alertActive;
  if (!wasActive && pct >= ALERT_THRESHOLD_PCT) {
    vramState.alertActive = true;
    vramState.alertSince = new Date(now).toISOString();
    saveVramState(vramState);
    await sendAlert(true, { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct });
  } else if (wasActive && pct <= ALERT_THRESHOLD_PCT - ALERT_HYSTERESIS_PCT) {
    vramState.alertActive = false;
    vramState.alertSince = null;
    saveVramState(vramState);
    await sendAlert(false, { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct });
  } else {
    saveVramState(vramState);
  }
}

sampleOnce();
setInterval(sampleOnce, SAMPLE_INTERVAL_MS);

app.get("/vram", requireGateToken, (req, res) => {
  try {
    const mem = readGpuStats();
    const pct = (mem.usedMiB / mem.totalMiB) * 100;
    const now = Date.now();
    const windowSamples = vramState.samples.filter((s) => now - s.t <= WINDOW_MS);
    const peak = windowSamples.reduce(
      (best, s) => {
        const p = (s.usedMiB / s.totalMiB) * 100;
        return p > best.pct ? { usedMiB: s.usedMiB, totalMiB: s.totalMiB, pct: p, at: s.t } : best;
      },
      { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct, at: now }
    );
    const { breakdown, confidence } = buildBreakdown();
    res.json({
      ok: true,
      current: { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct, gpuUtil: mem.gpuUtil },
      peak24h: { usedMiB: peak.usedMiB, totalMiB: peak.totalMiB, pct: peak.pct, at: new Date(peak.at).toISOString() },
      breakdown,
      breakdownConfidence: confidence,
      lastSampleAt: new Date(now).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
app.post("/vram/agent-map", requireGateToken, (req, res) => {
  try {
    const { modelAgentMap } = req.body || {};
    if (!modelAgentMap || typeof modelAgentMap !== "object" || Array.isArray(modelAgentMap)) {
      return res.status(400).json({ error: "modelAgentMap (object) required" });
    }
    for (const [k, v] of Object.entries(modelAgentMap)) {
      if (typeof k !== "string" || typeof v !== "string") {
        return res.status(400).json({ error: "modelAgentMap keys and values must be strings" });
      }
    }
    vramState.pushedAgentMap = Object.assign({}, vramState.pushedAgentMap || {}, modelAgentMap);
    saveVramState(vramState);
    console.log("vram: agent-map updated:", JSON.stringify(vramState.pushedAgentMap));
    res.json({ ok: true, agentMap: vramState.pushedAgentMap });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
// --- fine VRAM monitor ---------------------------------------------------

// BikerLink task #153 — ricerca semantica manuale Nadir
require("./nadir-search")(app, { requireGateToken, SHARED_ROOT, fs, path, http, https, URL });

app.listen(PORT, () => {
  console.log(`ai-hub listening on :${PORT}, sharedRoot=${SHARED_ROOT}`);
});
