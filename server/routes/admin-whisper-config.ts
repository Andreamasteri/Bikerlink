/**
 * Admin — Whisper STT Config
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../lib/api-response";
import {
  getSttProviderStatusList,
  setSttProviderChain,
  ALL_STT_PROVIDERS,
  type SttProviderId,
} from "../ai/whisper-provider-config";
import {
  safeUrl,
  buildSilentWav,
  buildMinimalM4a,
  probeHomeFormat,
} from "./admin-whisper-config.helpers";

import { handleWhisperHealth, handleWhisperReset, handleWhisperDiagnose } from "./admin-whisper-config.part2";

const router = Router();

router.get("/whisper-config", async (_req: Request, res: Response) => {
  try {
    const data = await getSttProviderStatusList();
    res.json(data);
  } catch (err) {
    console.error("[admin/whisper-config] GET error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

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

router.post("/whisper-config/test/:providerId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as SttProviderId;
  const sessionUserId = (req.session as { userId?: string })?.userId ?? null;
  const sessionOk = sessionUserId != null;
  const logId = `${providerId}-${Date.now().toString(36)}`;
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
      if (!whisperUrl) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "WHISPER_URL non configurata.", session_ok: sessionOk });
        return;
      }
      const endpoint = whisperUrl.replace(/\/$/, "") + "/inference";
      const headers: Record<string, string> = {};
      if (whisperToken) headers["X-Whisper-Token"] = whisperToken;
      const wavResult = await probeHomeFormat(logId, endpoint, headers, wav, "audio/wav", "silence.wav", 15000);
      const m4aResult = await probeHomeFormat(logId, endpoint, headers, buildMinimalM4a(), "audio/x-m4a", "silence.m4a", 10000);
      const latency_ms = Date.now() - start;
      const ok = wavResult.ok;
      res.json({
        success: ok, ok, latency_ms, session_ok: sessionOk, text: wavResult.text,
        error: ok ? undefined : wavResult.error,
        wav: { ok: wavResult.ok, latency_ms: wavResult.latency_ms, error: wavResult.error },
        m4a: { ok: m4aResult.ok, latency_ms: m4aResult.latency_ms, error: m4aResult.error },
      });
      return;
    }
    if (providerId === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "GROQ_API_KEY non configurata.", session_ok: sessionOk });
        return;
      }
      const groqUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "silence.wav");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");
      const groqRes = await fetch(groqUrl, { method: "POST", headers: { Authorization: `Bearer ${groqKey}`, "Accept-Encoding": "identity" }, body: formData });
      const latency_ms = Date.now() - start;
      const rawText = await groqRes.text().catch(() => "");
      if (!groqRes.ok) {
        res.json({ success: false, ok: false, latency_ms, error: `HTTP ${groqRes.status}`, session_ok: sessionOk });
        return;
      }
      res.json({ success: true, ok: true, latency_ms, session_ok: sessionOk });
      return;
    }
    if (providerId === "openai") {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        res.json({ success: false, ok: false, latency_ms: 0, error: "OPENAI_API_KEY non configurata.", session_ok: sessionOk });
        return;
      }
      const openaiUrl = "https://api.openai.com/v1/audio/transcriptions";
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "silence.wav");
      formData.append("model", "whisper-1");
      formData.append("response_format", "json");
      const openaiRes = await fetch(openaiUrl, { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Accept-Encoding": "identity" }, body: formData });
      const latency_ms = Date.now() - start;
      if (!openaiRes.ok) {
        res.json({ success: false, ok: false, latency_ms, error: `HTTP ${openaiRes.status}`, session_ok: sessionOk });
        return;
      }
      res.json({ success: true, ok: true, latency_ms, session_ok: sessionOk });
      return;
    }
    sendError(res, 400, "Provider non gestito");
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

router.post("/whisper-config/diagnose", handleWhisperDiagnose);
router.get("/whisper-health", handleWhisperHealth);
router.post("/whisper-reset", handleWhisperReset);

export default router;
