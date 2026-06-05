/**
 * Admin — Whisper STT Config
 *
 * GET  /api/admin/whisper-config             → chain attiva, statuses, env override
 * PUT  /api/admin/whisper-config             → salva nuova chain nel DB
 * POST /api/admin/whisper-config/test/:id    → testa un singolo provider con audio silenzioso
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

const router = Router();

/** Genera un file WAV silenzioso minimale (0.5s, mono 16kHz, 16-bit PCM). */
function buildSilentWav(): Buffer {
  const sampleRate = 16000;
  const durationSec = 0.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize, 0);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

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
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error("[admin/whisper-config] PUT error:", err);
    sendError(res, 500, (err as Error).message);
  }
});

// ── POST /whisper-config/test/:providerId ──────────────────────────────────
router.post("/whisper-config/test/:providerId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as SttProviderId;
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
        res.json({ ok: false, latency_ms: 0, error: "WHISPER_URL non configurata." });
        return;
      }

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
      formData.append("file", blob, "silence.wav");
      formData.append("response_format", "json");

      const headers: Record<string, string> = {};
      if (whisperToken) headers["X-Whisper-Token"] = whisperToken;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const homeRes = await fetch(
          whisperUrl.replace(/\/$/, "") + "/inference",
          { method: "POST", headers, body: formData, signal: controller.signal }
        );
        clearTimeout(timeout);
        const latency_ms = Date.now() - start;
        if (!homeRes.ok) {
          const errText = await homeRes.text().catch(() => "");
          res.json({ ok: false, latency_ms, error: `HTTP ${homeRes.status}: ${errText}`.slice(0, 200) });
          return;
        }
        const data = (await homeRes.json()) as { text?: string };
        res.json({ ok: true, latency_ms, text: (data.text ?? "").trim().slice(0, 200) });
      } catch (e) {
        clearTimeout(timeout);
        const latency_ms = Date.now() - start;
        const msg = e instanceof Error ? e.message : String(e);
        res.json({ ok: false, latency_ms, error: msg.slice(0, 200) });
      }
      return;
    }

    if (providerId === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        res.json({ ok: false, latency_ms: 0, error: "GROQ_API_KEY non configurata." });
        return;
      }

      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
        formData.append("file", blob, "silence.wav");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("response_format", "json");

        const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: formData,
        });
        const latency_ms = Date.now() - start;
        if (!groqRes.ok) {
          const errText = await groqRes.text().catch(() => "");
          res.json({ ok: false, latency_ms, error: `HTTP ${groqRes.status}: ${errText}`.slice(0, 200) });
          return;
        }
        const data = (await groqRes.json()) as { text?: string };
        res.json({ ok: true, latency_ms, text: (data.text ?? "").trim().slice(0, 200) });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const msg = e instanceof Error ? e.message : String(e);
        res.json({ ok: false, latency_ms, error: msg.slice(0, 200) });
      }
      return;
    }

    if (providerId === "openai") {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        res.json({ ok: false, latency_ms: 0, error: "OPENAI_API_KEY non configurata." });
        return;
      }

      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(wav)], { type: "audio/wav" });
        formData.append("file", blob, "silence.wav");
        formData.append("model", "whisper-1");
        formData.append("response_format", "json");

        const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
        });
        const latency_ms = Date.now() - start;
        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => "");
          res.json({ ok: false, latency_ms, error: `HTTP ${openaiRes.status}: ${errText}`.slice(0, 200) });
          return;
        }
        const data = (await openaiRes.json()) as { text?: string };
        res.json({ ok: true, latency_ms, text: (data.text ?? "").trim().slice(0, 200) });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const msg = e instanceof Error ? e.message : String(e);
        res.json({ ok: false, latency_ms, error: msg.slice(0, 200) });
      }
      return;
    }

    sendError(res, 400, "Provider non gestito");
  } catch (err) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/whisper-config/test/${providerId}] error:`, msg);
    res.json({ ok: false, latency_ms, error: msg.slice(0, 200) });
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
