/**
 * VRAM monitor routes for ai-hub — extracted for testability.
 *
 * mountVramRoutes(app, opts) registers POST /vram/agent-map and GET /vram on
 * the given Express app, and optionally starts the periodic nvidia-smi sampler.
 *
 * All system-level I/O is channelled through `opts.sys` so that tests can
 * inject mocks without monkey-patching globals:
 *
 *   opts.sys.readGpuStats()      → { usedMiB, totalMiB, gpuUtil }
 *   opts.sys.readComputeApps()   → [{ pid, usedMiB }, ...]
 *   opts.sys.readOllamaModels()  → string[]
 *   opts.sys.loadState()         → vramState object
 *   opts.sys.saveState(state)    → void
 *
 * opts.gateMiddleware  — Express middleware that enforces the gate token
 * opts.startSampling   — boolean (default true); set false in tests
 * opts.sampleIntervalMs — override for VRAM_SAMPLE_INTERVAL_MS (default 45000)
 * opts.alertThresholdPct — override for VRAM_ALERT_THRESHOLD_PCT (default 90)
 * opts.alertHysteresisPct — override for VRAM_ALERT_HYSTERESIS_PCT (default 10)
 * opts.alertUrl        — override for BIKERBLOG_VRAM_ALERT_URL
 * opts.gpuUtilStuckThresholdPct — override for GPU_UTIL_STUCK_THRESHOLD_PCT (default 95)
 * opts.gpuUtilStuckMinSamples   — override for GPU_UTIL_STUCK_MIN_SAMPLES (default 7)
 * opts.gpuUtilAlertUrl — override for BIKERBLOG_GPU_UTIL_ALERT_URL
 * opts.postJson        — injectable HTTP POST helper (default: real postJson)
 *
 * Returns { getVramState } — accessor to the live in-memory vramState (for tests).
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const WINDOW_MS = 24 * 60 * 60 * 1000;

// model -> agent name; pushed map (POST /vram/agent-map) overrides this at runtime.
//
// CANONICAL AGENT LINEUP (Task #535):
//   qwen3:4b        → Horus      (GPU residente, keep_alive:-1)
//   qwen3:1.7b      → Bowie      (GPU residente, keep_alive:-1)
//   granite4:tiny-h → Quebracho  (CPU+RAM residente, keep_alive:-1)
//   all-minilm      → Nadir      (GPU residente, keep_alive:-1)
//   devstral:latest → Ares       (on-demand, keep_alive:0 post-call)
//
// Voci RIMOSSE (stantie): "bikerlink:latest" (alias legacy Horus non più in uso),
// "llama3.2:3b" (vecchio modello Bowie, sostituito da qwen3:1.7b).
const DEFAULT_AGENT_MAP = {
  "qwen3:4b": "Horus",
  "qwen3:1.7b": "Bowie",
  "granite4:tiny-h": "Quebracho",
  "all-minilm:latest": "Nadir",
  "devstral:latest": "Ares",
};

function defaultPostJson(gateToken) {
  return function postJson(urlStr, body) {
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
            "X-Hub-Gate-Token": gateToken,
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
  };
}

function mountVramRoutes(app, opts) {
  const {
    sys,
    gateMiddleware,
    startSampling = true,
    sampleIntervalMs = Number(process.env.VRAM_SAMPLE_INTERVAL_MS || 45000),
    alertThresholdPct = Number(process.env.VRAM_ALERT_THRESHOLD_PCT || 90),
    alertHysteresisPct = Number(process.env.VRAM_ALERT_HYSTERESIS_PCT || 10),
    alertUrl = process.env.BIKERBLOG_VRAM_ALERT_URL || "",
    gpuUtilStuckThresholdPct = Number(process.env.GPU_UTIL_STUCK_THRESHOLD_PCT || 95),
    gpuUtilStuckMinSamples = Number(process.env.GPU_UTIL_STUCK_MIN_SAMPLES || 7),
    gpuUtilAlertUrl = process.env.BIKERBLOG_GPU_UTIL_ALERT_URL || alertUrl.replace("vram-alert", "gpu-util-alert"),
    postJson: _postJson,
  } = opts;

  // vramState is private to this mount; each test gets a fresh isolated instance.
  let vramState = sys.loadState();

  // ── Priority: pushedAgentMap > env VRAM_AGENT_MAP > DEFAULT_AGENT_MAP ──────
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

  // Heuristic-pair compute apps (sorted by VRAM desc) with ollama models.
  function buildBreakdown() {
    const apps = sys.readComputeApps().sort((a, b) => b.usedMiB - a.usedMiB);
    const models = sys.readOllamaModels();
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

  const postJsonFn = _postJson || defaultPostJson(process.env.HUB_GATE_TOKEN || "");

  async function sendAlert(active, sample) {
    if (!alertUrl) return;
    try {
      const status = await postJsonFn(alertUrl, {
        active,
        usedMiB: sample.usedMiB,
        totalMiB: sample.totalMiB,
        pct: sample.pct,
        thresholdPct: alertThresholdPct,
        since: vramState.alertSince,
      });
      console.log(`vram: alert POST (active=${active}) -> HTTP ${status}`);
    } catch (err) {
      console.error("vram: failed to send alert:", err.message || err);
    }
  }

  async function sendGpuUtilAlert(active, gpuUtil) {
    if (!gpuUtilAlertUrl) return;
    try {
      const status = await postJsonFn(gpuUtilAlertUrl, {
        active,
        utilPct: gpuUtil,
        thresholdPct: gpuUtilStuckThresholdPct,
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
      mem = sys.readGpuStats();
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
      if (mem.gpuUtil >= gpuUtilStuckThresholdPct) {
        vramState.gpuUtilStuckSamples = (vramState.gpuUtilStuckSamples || 0) + 1;
      } else {
        vramState.gpuUtilStuckSamples = 0;
      }
      const wasGpuAlertActive = vramState.gpuUtilAlertActive;
      if (!wasGpuAlertActive && vramState.gpuUtilStuckSamples >= gpuUtilStuckMinSamples) {
        vramState.gpuUtilAlertActive = true;
        vramState.gpuUtilAlertSince = new Date(now).toISOString();
        sys.saveState(vramState);
        await sendGpuUtilAlert(true, mem.gpuUtil);
      } else if (wasGpuAlertActive && mem.gpuUtil < gpuUtilStuckThresholdPct) {
        vramState.gpuUtilAlertActive = false;
        vramState.gpuUtilAlertSince = null;
        vramState.gpuUtilStuckSamples = 0;
        sys.saveState(vramState);
        await sendGpuUtilAlert(false, mem.gpuUtil);
      }
    }

    const wasActive = vramState.alertActive;
    if (!wasActive && pct >= alertThresholdPct) {
      vramState.alertActive = true;
      vramState.alertSince = new Date(now).toISOString();
      sys.saveState(vramState);
      await sendAlert(true, { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct });
    } else if (wasActive && pct <= alertThresholdPct - alertHysteresisPct) {
      vramState.alertActive = false;
      vramState.alertSince = null;
      sys.saveState(vramState);
      await sendAlert(false, { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct });
    } else {
      sys.saveState(vramState);
    }
  }

  if (startSampling) {
    sampleOnce();
    setInterval(sampleOnce, sampleIntervalMs);
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  app.get("/vram", gateMiddleware, (req, res) => {
    try {
      const mem = sys.readGpuStats();
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
      const nvme = sys.readNvmeStats ? sys.readNvmeStats() : undefined;
      const pcieAer = sys.readPcieAer ? sys.readPcieAer() : undefined;
      const response = {
        ok: true,
        current: { usedMiB: mem.usedMiB, totalMiB: mem.totalMiB, pct, gpuUtil: mem.gpuUtil },
        peak24h: {
          usedMiB: peak.usedMiB,
          totalMiB: peak.totalMiB,
          pct: peak.pct,
          at: new Date(peak.at).toISOString(),
        },
        breakdown,
        breakdownConfidence: confidence,
        lastSampleAt: new Date(now).toISOString(),
      };
      if (nvme !== undefined) response.nvme = nvme;
      if (pcieAer !== undefined) response.pcieAer = pcieAer;
      return res.json(response);
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.post("/vram/agent-map", gateMiddleware, (req, res) => {
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
      sys.saveState(vramState);
      console.log("vram: agent-map updated:", JSON.stringify(vramState.pushedAgentMap));
      return res.json({ ok: true, agentMap: vramState.pushedAgentMap });
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  });

  return {
    /** Accessor to the live in-memory vramState (useful in tests). */
    getVramState: () => vramState,
  };
}

module.exports = { mountVramRoutes, DEFAULT_AGENT_MAP };
