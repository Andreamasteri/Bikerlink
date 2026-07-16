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
// Logic extracted to vram-routes.js for testability.
// mountVramRoutes wires GET /vram and POST /vram/agent-map onto this app,
// starts the periodic nvidia-smi sampler, and accepts injectable sys deps.
const { mountVramRoutes } = require("./vram-routes");

const VRAM_STATE_FILE = path.join(__dirname, "vram-state.json");

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
      pushedAgentMap:
        raw.pushedAgentMap &&
        typeof raw.pushedAgentMap === "object" &&
        !Array.isArray(raw.pushedAgentMap)
          ? raw.pushedAgentMap
          : {},
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

mountVramRoutes(app, {
  sys: {
    readGpuStats,
    readComputeApps,
    readOllamaModels,
    loadState: loadVramState,
    saveState: saveVramState,
  },
  gateMiddleware: requireGateToken,
  startSampling: true,
});
// --- fine VRAM monitor ---------------------------------------------------

// BikerLink task #153 — ricerca semantica manuale Nadir
require("./nadir-search")(app, { requireGateToken, SHARED_ROOT, fs, path, http, https, URL });

app.listen(PORT, () => {
  console.log(`ai-hub listening on :${PORT}, sharedRoot=${SHARED_ROOT}`);
});
