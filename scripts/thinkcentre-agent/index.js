#!/usr/bin/env node
/**
 * ThinkCentre Metrics Agent
 * Leggero server HTTP da eseguire sul ThinkCentre.
 * Espone:
 *   GET  /sys-metrics      — CPU, RAM, uptime del mini-PC
 *   GET  /whisper-health   — stato live del servizio Whisper (probe + ultimo restart)
 *
 * Avvio:  node index.js
 * Porta:  9101  (override: PORT=xxxx node index.js)
 *
 * Variabili d'ambiente:
 *   WHISPER_LOCAL_PORT  — porta locale di whisper-server (default: 8089)
 *   WHISPER_TOKEN       — token X-Whisper-Token da inviare nella probe
 *
 * Requisiti: Node.js >= 16, Linux (/proc filesystem).
 */

const http = require("http");
const https = require("https");
const fs   = require("fs");
const { execFile } = require("child_process");

const PORT              = parseInt(process.env.PORT              || "9101", 10);
const WHISPER_LOCAL_PORT = parseInt(process.env.WHISPER_LOCAL_PORT || "8089", 10);
const WHISPER_TOKEN     = process.env.WHISPER_TOKEN || "";

// ── Stato watchdog condiviso ──────────────────────────────────────────────────
const watchdogState = {
  status: "UNKNOWN",      // "OK" | "DEGRADED" | "DOWN" | "UNKNOWN"
  lastCode: null,         // ultimo HTTP status code ricevuto (o null)
  lastCheck: null,        // timestamp ISO ultima probe
  consecutiveFails: 0,    // contatore errori consecutivi
  lastRestart: null,      // timestamp ISO ultimo restart automatico
  lastRestartReason: null,// motivo (es. "HTTP 403 × 2")
};

// ── Lettura /proc ─────────────────────────────────────────────────────────────
function readProc(path) {
  try { return fs.readFileSync(path, "utf8"); } catch { return ""; }
}

function getMetrics() {
  const loadAvg  = readProc("/proc/loadavg").trim().split(" ");
  const uptime   = parseFloat(readProc("/proc/uptime").split(" ")[0] || "0");
  const cores    = (readProc("/proc/cpuinfo").match(/^processor\s*:/gm) || []).length || 1;

  const memLines = Object.fromEntries(
    readProc("/proc/meminfo").split("\n")
      .filter(Boolean)
      .map(l => { const [k, v] = l.split(":"); return [k.trim(), parseInt(v) * 1024]; })
  );
  const totalMb  = Math.round((memLines["MemTotal"]  || 0) / 1048576);
  const freeMem  = (memLines["MemFree"] || 0) + (memLines["Buffers"] || 0) + (memLines["Cached"] || 0);
  const usedMb   = Math.round((memLines["MemTotal"] - freeMem) / 1048576);

  return {
    cpu: {
      loadAvg1:  parseFloat(loadAvg[0] || "0"),
      loadAvg5:  parseFloat(loadAvg[1] || "0"),
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

// ── Probe Whisper ─────────────────────────────────────────────────────────────
/** Genera un WAV silenzioso minimale (0.5s, mono 16kHz, 16-bit PCM). */
function buildSilentWav() {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * 0.5);
  const dataSize   = numSamples * 2; // 16-bit mono
  const buf        = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF",  0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16);           buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);           buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/**
 * Esegue una POST /inference locale con un WAV silenzioso.
 * Ritorna { ok, code, errorMsg }.
 */
function probeWhisperLocal() {
  return new Promise((resolve) => {
    const wav = buildSilentWav();

    // Boundary multipart
    const boundary  = "----BikerLinkProbe" + Date.now().toString(36);
    const CRLF      = "\r\n";
    const partHead  = (
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="probe.wav"${CRLF}` +
      `Content-Type: audio/wav${CRLF}${CRLF}`
    );
    const partTail  = (
      `${CRLF}--${boundary}--${CRLF}`
    );
    const partHead2 = (
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}` +
      `json${CRLF}`
    );

    // ordine: file poi response_format
    const body = Buffer.concat([
      Buffer.from(partHead2, "utf8"),
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="probe.wav"${CRLF}Content-Type: audio/wav${CRLF}${CRLF}`, "utf8"),
      wav,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf8"),
    ]);

    const reqHeaders = {
      "Content-Type":   `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    };
    if (WHISPER_TOKEN) reqHeaders["X-Whisper-Token"] = WHISPER_TOKEN;

    const options = {
      hostname: "127.0.0.1",
      port:     WHISPER_LOCAL_PORT,
      path:     "/inference",
      method:   "POST",
      headers:  reqHeaders,
      timeout:  10000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const code = res.statusCode || 0;
        if (code >= 200 && code < 300) {
          resolve({ ok: true, code, errorMsg: null });
        } else {
          resolve({ ok: false, code, errorMsg: `HTTP ${code}: ${data.slice(0, 120)}` });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ ok: false, code: 0, errorMsg: err.message.slice(0, 120) });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, code: 0, errorMsg: "timeout" });
    });

    req.write(body);
    req.end();
  });
}

/** Esegue `sudo systemctl restart whisper` e logga il risultato.
 * Aggiorna lastRestart / lastRestartReason solo se il comando va a buon fine. */
function restartWhisper(reason) {
  console.log(`[watchdog] avvio restart whisper — motivo: ${reason}`);
  watchdogState.consecutiveFails = 0;
  execFile("sudo", ["systemctl", "restart", "whisper"], { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[watchdog] restart FALLITO: ${err.message}`);
    } else {
      const now = new Date().toISOString();
      watchdogState.lastRestart       = now;
      watchdogState.lastRestartReason = reason;
      console.log(`[watchdog] restart COMPLETATO al ${now}${stdout ? " stdout=" + stdout.trim() : ""}${stderr ? " stderr=" + stderr.trim() : ""}`);
    }
  });
}

// ── Loop watchdog (ogni 60s) ──────────────────────────────────────────────────
async function watchdogTick() {
  try {
    const result = await probeWhisperLocal();
    const now    = new Date().toISOString();

    watchdogState.lastCheck = now;
    watchdogState.lastCode  = result.code || null;

    if (result.ok) {
      watchdogState.status           = "OK";
      watchdogState.consecutiveFails = 0;
      console.log(`[watchdog] Whisper OK (HTTP ${result.code})`);
    } else {
      // Solo 403, 5xx e timeout/rete (code=0) giustificano un restart.
      // Altri 4xx (es. 400 Bad Request) indicano un problema di probe shape,
      // non un servizio down: li classifichiamo DEGRADED senza restart.
      const isRestartable = result.code === 403 || result.code >= 500 || result.code === 0;

      if (isRestartable) {
        watchdogState.consecutiveFails += 1;
        watchdogState.status = result.code === 403 ? "DEGRADED" : "DOWN";
        console.warn(`[watchdog] Whisper fail #${watchdogState.consecutiveFails} (restartable) — ${result.errorMsg}`);

        if (watchdogState.consecutiveFails >= 2) {
          watchdogState.status = "DOWN";
          const reason = `HTTP ${result.code || "timeout"} × ${watchdogState.consecutiveFails}`;
          console.warn(`[watchdog] Whisper DOWN — ${reason} — avvio auto-restart`);
          restartWhisper(reason);
        }
      } else {
        // 4xx non-restartable: segnala DEGRADED ma non incrementa il contatore di restart
        watchdogState.status = "DEGRADED";
        console.warn(`[watchdog] Whisper DEGRADED (non-restartable HTTP ${result.code}) — ${result.errorMsg}`);
      }
    }
  } catch (err) {
    console.error("[watchdog] eccezione nel tick:", err.message);
  }
}

// Avvia il loop immediatamente + ogni 60s
watchdogTick();
setInterval(watchdogTick, 60_000);

// ── Server HTTP ───────────────────────────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === "/sys-metrics") {
    try {
      const body = JSON.stringify(getMetrics());
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
      res.end(body);
    } catch (err) {
      res.writeHead(500); res.end(String(err));
    }
    return;
  }

  if (req.url === "/whisper-health") {
    const body = JSON.stringify({
      status:            watchdogState.status,
      lastCode:          watchdogState.lastCode,
      lastCheck:         watchdogState.lastCheck,
      lastRestart:       watchdogState.lastRestart,
      lastRestartReason: watchdogState.lastRestartReason,
    });
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  res.writeHead(404); res.end("Not found");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[thinkcentre-agent] in ascolto su http://0.0.0.0:${PORT}`);
  console.log(`[thinkcentre-agent] endpoints: /sys-metrics, /whisper-health`);
});
