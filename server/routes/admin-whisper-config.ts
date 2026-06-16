/**
 * Admin — Whisper STT Config
 *
 * GET  /api/admin/whisper-config             → chain attiva, statuses, env override
 * PUT  /api/admin/whisper-config             → salva nuova chain nel DB
 * POST /api/admin/whisper-config/test/:id    → testa un singolo provider con audio silenzioso
 * POST /api/admin/whisper-config/diagnose    → diagnostica completa sequenziale di tutti i provider
 *
 * Auth: _requireAdmin (applicato dal router padre in admin.ts).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../lib/api-response";
import {
  getSttProviderStatusList,
  setSttProviderChain,
  ALL_STT_PROVIDERS,
  DEFAULT_STT_CHAIN,
  type SttProviderId,
} from "../ai/whisper-provider-config";
import {
  safeUrl,
  buildSilentWav,
  buildMinimalM4a,
  probeHomeFormat,
  type FormatProbeResult,
} from "./admin-whisper-config.helpers";

const router = Router();

// ── GET /whisper-config ───────────────────────────────────────────────────────
router.get("/whisper-config", async (_req: Request, res: Response) => {
  try {
    const data = await getSttProviderStatusList();
    res.json(data);
  } catch (err) {
    console.error("[admin/whisper-config] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── PUT /whisper-config ───────────────────────────────────────────────────────
const PutBody = z.object({
  chain: z.array(z.enum(["home", "groq", "openai"])).min(1),
});

router.put("/whisper-config", async (req: Request, res: Response) => {
  const parsed = PutBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0].message);
    return;
  }

  try {
    await setSttProviderChain(parsed.data.chain);
    const data = await getSttProviderStatusList();
    res.json({ success: true, ok: true, ...data });
  } catch (err) {
    console.error("[admin/whisper-config] PUT error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /whisper-config/test/:providerId ──────────────────────────────────
router.post("/whisper-config/test/:providerId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as SttProviderId;
  const sessionUserId = (req.session as { userId?: string })?.userId ?? null;
  const sessionOk = sessionUserId != null;
  const logId = `${providerId}-${Date.now().toString(36)}`;

  console.log(`[whisper-test/${logId}] START provider="${providerId}" session_userId="${sessionUserId ?? "none"}" session_ok=${sessionOk} ip=${req.ip}`);

  if (!ALL_STT_PROVIDERS.includes(providerId)) {
    sendError(res, 400, `Provider non valido: ${providerId}`);
    return;
  }

  const start = Date.now();

  try {
    const wav = buildSilentWav();

    if (providerId === "home") {
      const whisperUrl = process.env.WHISPER_URL;
      const whisperToken = process.env.WHISPER_TOKEN;
      const envKeyPresent = !!whisperUrl;
      console.log(`[whisper-test/${logId}] home env_key_present=${envKeyPresent} WHISPER_URL="${whisperUrl ? safeUrl(whisperUrl) : "not set"}"`);

      if (!whisperUrl) {
        const payload = { success: false, ok: false, latency_ms: 0, error: "WHISPER_URL non configurata.", session_ok: sessionOk };
        console.log(`[whisper-test/${logId}] home ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
        return;
      }

      const endpoint = whisperUrl.replace(/\/$/, "") + "/inference";
      const headers: Record<string, string> = {};
      if (whisperToken) headers["X-Whisper-Token"] = whisperToken;

      const wavResult = await probeHomeFormat(logId, endpoint, headers, wav, "audio/wav", "silence.wav", 15000);
      const m4aResult = await probeHomeFormat(logId, endpoint, headers, buildMinimalM4a(), "audio/x-m4a", "silence.m4a", 10000);

      const latency_ms = Date.now() - start;
      const ok = wavResult.ok;
      console.log(
        `[whisper-test/${logId}] home DONE ok=${ok} latency_ms=${latency_ms}` +
        ` wav=${wavResult.ok ? "ok" : `fail:${wavResult.error ?? "?"}`}` +
        ` m4a=${m4aResult.ok ? "ok" : `fail:${m4aResult.error ?? "?"}`}`
      );
      res.json({
        success: ok,
        ok,
        latency_ms,
        session_ok: sessionOk,
        text: wavResult.text,
        error: ok ? undefined : wavResult.error,
        body_raw: ok ? undefined : wavResult.body_raw,
        wav: { ok: wavResult.ok, latency_ms: wavResult.latency_ms, error: wavResult.error, text: wavResult.text, body_raw: wavResult.body_raw },
        m4a: { ok: m4aResult.ok, latency_ms: m4aResult.latency_ms, error: m4aResult.error, body_raw: m4aResult.body_raw },
      });
      return;
    }

    if (providerId === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      const envKeyPresent = !!groqKey;
      console.log(`[whisper-test/${logId}] groq env_key_present=${envKeyPresent}`);

      if (!groqKey) {
        const payload = { success: false, ok: false, latency_ms: 0, error: "GROQ_API_KEY non configurata.", session_ok: sessionOk };
        console.log(`[whisper-test/${logId}] groq ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
        return;
      }

      try {
        const groqUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
        formData.append("file", blob, "silence.wav");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("response_format", "json");

        console.log(`[whisper-test/${logId}] groq→fetch url="${groqUrl}" model="whisper-large-v3-turbo"`);
        const t0 = Date.now();
        const groqRes = await fetch(groqUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Accept-Encoding": "identity" },
          body: formData,
        });
        const latency_ms = Date.now() - t0;
        const contentType = groqRes.headers.get("content-type") ?? "unknown";
        const rawText = await groqRes.text().catch(() => "");
        const bodyPreview = rawText.slice(0, 300);
        console.log(`[whisper-test/${logId}] groq→response status=${groqRes.status} content-type="${contentType}" latency=${latency_ms}ms body_preview="${bodyPreview}"`);

        if (!groqRes.ok) {
          const error = `HTTP ${groqRes.status}: ${rawText}`.slice(0, 200);
          console.log(`[whisper-test/${logId}] groq ok=false latency_ms=${latency_ms} error="${error}"`);
          res.json({ success: false, ok: false, latency_ms, error, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        if (rawText.charCodeAt(0) === 0) {
          const encoding = groqRes.headers.get("content-encoding") ?? "unknown";
          console.log(`[whisper-test/${logId}] groq BINARY_RESPONSE content-encoding="${encoding}"`);
          res.json({ success: false, ok: false, latency_ms, error: `Risposta binaria/compressa non parsabile (content-encoding: ${encoding})`, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        let data: { text?: string };
        try {
          data = JSON.parse(rawText) as { text?: string };
        } catch (parseErr) {
          console.log(`[whisper-test/${logId}] groq PARSE_FAIL body="${bodyPreview}"`);
          res.json({ success: false, ok: false, latency_ms, error: `Risposta non-JSON: ${rawText.slice(0, 200)}`, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        const text = (data.text ?? "").trim().slice(0, 200);
        if (text) console.log(`[whisper-test/${logId}] groq→transcribed text="${text.slice(0, 100)}"`);
        console.log(`[whisper-test/${logId}] groq ok=true latency_ms=${latency_ms}`);
        res.json({ success: true, ok: true, latency_ms, text, session_ok: sessionOk });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.log(`[whisper-test/${logId}] groq ok=false latency_ms=${latency_ms} error="${error}"`);
        res.json({ success: false, ok: false, latency_ms, error, session_ok: sessionOk });
      }
      return;
    }

    if (providerId === "openai") {
      const openaiKey = process.env.OPENAI_API_KEY;
      const envKeyPresent = !!openaiKey;
      console.log(`[whisper-test/${logId}] openai env_key_present=${envKeyPresent}`);

      if (!openaiKey) {
        const payload = { success: false, ok: false, latency_ms: 0, error: "OPENAI_API_KEY non configurata.", session_ok: sessionOk };
        console.log(`[whisper-test/${logId}] openai ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
        return;
      }

      try {
        const openaiUrl = "https://api.openai.com/v1/audio/transcriptions";
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
        formData.append("file", blob, "silence.wav");
        formData.append("model", "whisper-1");
        formData.append("response_format", "json");

        console.log(`[whisper-test/${logId}] openai→fetch url="${openaiUrl}" model="whisper-1"`);
        const t0 = Date.now();
        const openaiRes = await fetch(openaiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Accept-Encoding": "identity" },
          body: formData,
        });
        const latency_ms = Date.now() - t0;
        const contentType = openaiRes.headers.get("content-type") ?? "unknown";
        const rawText = await openaiRes.text().catch(() => "");
        const bodyPreview = rawText.slice(0, 300);
        console.log(`[whisper-test/${logId}] openai→response status=${openaiRes.status} content-type="${contentType}" latency=${latency_ms}ms body_preview="${bodyPreview}"`);

        if (!openaiRes.ok) {
          const error = `HTTP ${openaiRes.status}: ${rawText}`.slice(0, 200);
          console.log(`[whisper-test/${logId}] openai ok=false latency_ms=${latency_ms} error="${error}"`);
          res.json({ success: false, ok: false, latency_ms, error, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        if (rawText.charCodeAt(0) === 0) {
          const encoding = openaiRes.headers.get("content-encoding") ?? "unknown";
          console.log(`[whisper-test/${logId}] openai BINARY_RESPONSE content-encoding="${encoding}"`);
          res.json({ success: false, ok: false, latency_ms, error: `Risposta binaria/compressa non parsabile (content-encoding: ${encoding})`, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        let data: { text?: string };
        try {
          data = JSON.parse(rawText) as { text?: string };
        } catch (parseErr) {
          console.log(`[whisper-test/${logId}] openai PARSE_FAIL body="${bodyPreview}"`);
          res.json({ success: false, ok: false, latency_ms, error: `Risposta non-JSON: ${rawText.slice(0, 200)}`, session_ok: sessionOk, body_raw: bodyPreview });
          return;
        }

        const text = (data.text ?? "").trim().slice(0, 200);
        if (text) console.log(`[whisper-test/${logId}] openai→transcribed text="${text.slice(0, 100)}"`);
        console.log(`[whisper-test/${logId}] openai ok=true latency_ms=${latency_ms}`);
        res.json({ success: true, ok: true, latency_ms, text, session_ok: sessionOk });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.log(`[whisper-test/${logId}] openai ok=false latency_ms=${latency_ms} error="${error}"`);
        res.json({ success: false, ok: false, latency_ms, error, session_ok: sessionOk });
      }
      return;
    }

    sendError(res, 400, "Provider non gestito");
  } catch (err) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whisper-test/${logId}] outer-catch ok=false latency_ms=${latency_ms} error="${msg}"`);
    res.json({ success: false, ok: false, latency_ms, error: msg.slice(0, 200), session_ok: sessionOk });
  }
});

// ── POST /whisper-config/diagnose ─────────────────────────────────────────────
interface DiagStep {
  label: string;
  ok: boolean;
  latency_ms: number | null;
  detail: string;
}

router.post("/whisper-config/diagnose", async (req: Request, res: Response) => {
  const sessionUserId = (req.session as { userId?: string })?.userId ?? null;
  const sessionOk = sessionUserId != null;
  const logId = `diagnose-${Date.now().toString(36)}`;
  const steps: DiagStep[] = [];

  console.log(`[whisper-diagnose/${logId}] START session_userId="${sessionUserId ?? "none"}" session_ok=${sessionOk} ip=${req.ip}`);

  steps.push({
    label: "Sessione admin",
    ok: sessionOk,
    latency_ms: null,
    detail: sessionOk ? `userId="${sessionUserId}"` : "Nessuna sessione valida trovata",
  });

  const wav = buildSilentWav();

  for (const providerId of (["home", "groq", "openai"] as SttProviderId[])) {
    if (providerId === "home") {
      const whisperUrl = process.env.WHISPER_URL;
      const whisperToken = process.env.WHISPER_TOKEN;

      steps.push({
        label: "home — env key (WHISPER_URL)",
        ok: !!whisperUrl,
        latency_ms: null,
        detail: whisperUrl ? `WHISPER_URL="${safeUrl(whisperUrl)}"` : "WHISPER_URL non configurata",
      });

      if (!whisperUrl) {
        steps.push({ label: "home — connettività HTTP", ok: false, latency_ms: null, detail: "Saltato: WHISPER_URL mancante" });
        steps.push({ label: "home — trascrizione WAV", ok: false, latency_ms: null, detail: "Saltato: WHISPER_URL mancante" });
        continue;
      }

      const baseUrl = whisperUrl.replace(/\/$/, "");
      const safeBase = safeUrl(baseUrl);
      const connectT0 = Date.now();
      try {
        const headRes = await fetch(baseUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const connLatency = Date.now() - connectT0;
        steps.push({
          label: "home — connettività HTTP",
          ok: headRes.status < 500,
          latency_ms: connLatency,
          detail: `HEAD ${safeBase} → HTTP ${headRes.status} (${connLatency}ms)`,
        });
      } catch (e) {
        const connLatency = Date.now() - connectT0;
        steps.push({
          label: "home — connettività HTTP",
          ok: false,
          latency_ms: connLatency,
          detail: `HEAD ${safeBase} → errore: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      const headers: Record<string, string> = {};
      if (whisperToken) headers["X-Whisper-Token"] = whisperToken;
      const wavRes = await probeHomeFormat(logId, `${baseUrl}/inference`, headers, wav, "audio/wav", "silence.wav", 15000);
      steps.push({
        label: "home — trascrizione WAV",
        ok: wavRes.ok,
        latency_ms: wavRes.latency_ms,
        detail: wavRes.ok
          ? `OK${wavRes.text ? ` — testo: "${wavRes.text.slice(0, 80)}"` : " — nessun testo (silenzio OK)"}`
          : `${wavRes.error ?? "Errore"}${wavRes.body_raw ? ` — body: "${wavRes.body_raw.slice(0, 120)}"` : ""}`,
      });

    } else if (providerId === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      steps.push({
        label: "groq — env key (GROQ_API_KEY)",
        ok: !!groqKey,
        latency_ms: null,
        detail: groqKey ? "GROQ_API_KEY presente" : "GROQ_API_KEY non configurata",
      });

      if (!groqKey) {
        steps.push({ label: "groq — connettività HTTP", ok: false, latency_ms: null, detail: "Saltato: GROQ_API_KEY mancante" });
        steps.push({ label: "groq — trascrizione WAV", ok: false, latency_ms: null, detail: "Saltato: GROQ_API_KEY mancante" });
        continue;
      }

      const groqBase = "https://api.groq.com";
      const connT0 = Date.now();
      try {
        const headRes = await fetch(groqBase, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const connLatency = Date.now() - connT0;
        steps.push({
          label: "groq — connettività HTTP",
          ok: headRes.status < 500,
          latency_ms: connLatency,
          detail: `HEAD ${groqBase} → HTTP ${headRes.status} (${connLatency}ms)`,
        });
      } catch (e) {
        const connLatency = Date.now() - connT0;
        steps.push({
          label: "groq — connettività HTTP",
          ok: false,
          latency_ms: connLatency,
          detail: `HEAD ${groqBase} → errore: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      try {
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "silence.wav");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("response_format", "json");
        const t0 = Date.now();
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Accept-Encoding": "identity" },
          body: formData,
          signal: AbortSignal.timeout(20000),
        });
        const latency_ms = Date.now() - t0;
        const rawText = await r.text().catch(() => "");
        const bodyPreview = rawText.slice(0, 300);
        if (!r.ok) {
          steps.push({ label: "groq — trascrizione WAV", ok: false, latency_ms, detail: `HTTP ${r.status} — body: "${bodyPreview.slice(0, 120)}"` });
        } else if (rawText.charCodeAt(0) === 0) {
          const encoding = r.headers.get("content-encoding") ?? "unknown";
          steps.push({ label: "groq — trascrizione WAV", ok: false, latency_ms, detail: `BINARY_RESPONSE — content-encoding: ${encoding}` });
        } else {
          let parsed: { text?: string } | null = null;
          try { parsed = JSON.parse(rawText) as { text?: string }; } catch { /* ignore */ }
          if (!parsed) {
            steps.push({ label: "groq — trascrizione WAV", ok: false, latency_ms, detail: `PARSE_FAIL — body: "${bodyPreview.slice(0, 120)}"` });
          } else {
            const text = (parsed.text ?? "").trim();
            steps.push({ label: "groq — trascrizione WAV", ok: true, latency_ms, detail: `OK${text ? ` — testo: "${text.slice(0, 80)}"` : " — nessun testo (silenzio OK)"}` });
          }
        }
      } catch (e) {
        steps.push({ label: "groq — trascrizione WAV", ok: false, latency_ms: null, detail: `Eccezione: ${e instanceof Error ? e.message : String(e)}` });
      }

    } else if (providerId === "openai") {
      const openaiKey = process.env.OPENAI_API_KEY;
      steps.push({
        label: "openai — env key (OPENAI_API_KEY)",
        ok: !!openaiKey,
        latency_ms: null,
        detail: openaiKey ? "OPENAI_API_KEY presente" : "OPENAI_API_KEY non configurata",
      });

      if (!openaiKey) {
        steps.push({ label: "openai — connettività HTTP", ok: false, latency_ms: null, detail: "Saltato: OPENAI_API_KEY mancante" });
        steps.push({ label: "openai — trascrizione WAV", ok: false, latency_ms: null, detail: "Saltato: OPENAI_API_KEY mancante" });
        continue;
      }

      const openaiBase = "https://api.openai.com";
      const connT0 = Date.now();
      try {
        const headRes = await fetch(openaiBase, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const connLatency = Date.now() - connT0;
        steps.push({
          label: "openai — connettività HTTP",
          ok: headRes.status < 500,
          latency_ms: connLatency,
          detail: `HEAD ${openaiBase} → HTTP ${headRes.status} (${connLatency}ms)`,
        });
      } catch (e) {
        const connLatency = Date.now() - connT0;
        steps.push({
          label: "openai — connettività HTTP",
          ok: false,
          latency_ms: connLatency,
          detail: `HEAD ${openaiBase} → errore: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      try {
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "silence.wav");
        formData.append("model", "whisper-1");
        formData.append("response_format", "json");
        const t0 = Date.now();
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Accept-Encoding": "identity" },
          body: formData,
          signal: AbortSignal.timeout(20000),
        });
        const latency_ms = Date.now() - t0;
        const rawText = await r.text().catch(() => "");
        const bodyPreview = rawText.slice(0, 300);
        if (!r.ok) {
          steps.push({ label: "openai — trascrizione WAV", ok: false, latency_ms, detail: `HTTP ${r.status} — body: "${bodyPreview.slice(0, 120)}"` });
        } else if (rawText.charCodeAt(0) === 0) {
          const encoding = r.headers.get("content-encoding") ?? "unknown";
          steps.push({ label: "openai — trascrizione WAV", ok: false, latency_ms, detail: `BINARY_RESPONSE — content-encoding: ${encoding}` });
        } else {
          let parsed: { text?: string } | null = null;
          try { parsed = JSON.parse(rawText) as { text?: string }; } catch { /* ignore */ }
          if (!parsed) {
            steps.push({ label: "openai — trascrizione WAV", ok: false, latency_ms, detail: `PARSE_FAIL — body: "${bodyPreview.slice(0, 120)}"` });
          } else {
            const text = (parsed.text ?? "").trim();
            steps.push({ label: "openai — trascrizione WAV", ok: true, latency_ms, detail: `OK${text ? ` — testo: "${text.slice(0, 80)}"` : " — nessun testo (silenzio OK)"}` });
          }
        }
      } catch (e) {
        steps.push({ label: "openai — trascrizione WAV", ok: false, latency_ms: null, detail: `Eccezione: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  const passCount = steps.filter((s) => s.ok).length;
  console.log(`[whisper-diagnose/${logId}] DONE steps=${steps.length} pass=${passCount} fail=${steps.length - passCount}`);
  res.json({ steps });
});

// ── GET /whisper-health ──────────────────────────────────────────────────────
/**
 * Proxy verso GET thinkcentre-agent:9101/whisper-health.
 * Ritorna { status, lastCode, lastCheck, lastRestart, lastRestartReason, agentOnline }.
 * Se l'agente non è raggiungibile → agentOnline=false, status="UNKNOWN".
 */
router.get("/whisper-health", async (_req: Request, res: Response) => {
  const agentBase = process.env.THINKCENTRE_METRICS_URL?.replace(/\/$/, "");
  if (!agentBase) {
    return res.json({
      agentOnline: false,
      status: "UNKNOWN",
      lastCode: null,
      lastCheck: null,
      lastRestart: null,
      lastRestartReason: null,
      reason: "THINKCENTRE_METRICS_URL non configurato",
    });
  }

  const url = `${agentBase}/whisper-health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const agentRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!agentRes.ok) {
      return res.json({ agentOnline: false, status: "UNKNOWN", reason: `agent HTTP ${agentRes.status}` });
    }
    const data = await agentRes.json() as {
      status?: string;
      lastCode?: number | null;
      lastCheck?: string | null;
      lastRestart?: string | null;
      lastRestartReason?: string | null;
    };
    return res.json({ agentOnline: true, ...data });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return res.json({ agentOnline: false, status: "UNKNOWN", reason: msg.slice(0, 120) });
  }
});

// ── POST /whisper-config/reset ────────────────────────────────────────────────
router.post("/whisper-config/reset", async (_req: Request, res: Response) => {
  try {
    await setSttProviderChain(DEFAULT_STT_CHAIN);
    const data = await getSttProviderStatusList();
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error("[admin/whisper-config] reset error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

export default router;
