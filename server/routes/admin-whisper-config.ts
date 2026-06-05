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

/**
 * Genera un file M4A minimale valido (solo ftyp box).
 * Serve per testare se whisper.cpp accetta il contenitore M4A prima ancora di decodificare audio.
 * Il file non contiene audio reale: il server risponderà con un errore di decodifica se
 * supporta M4A, oppure con "formato non supportato" se M4A non è abilitato.
 */
function buildMinimalM4a(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x14, // size = 20 bytes
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x4d, 0x34, 0x41, 0x20, // major brand: 'M4A '
    0x00, 0x00, 0x00, 0x00, // minor version
    0x4d, 0x34, 0x41, 0x20, // compatible brand: 'M4A '
  ]);
}

interface FormatProbeResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
  text?: string;
}

/** Invia un file audio a /inference e ritorna il risultato con latenza. */
async function probeHomeFormat(
  endpoint: string,
  headers: Record<string, string>,
  buf: Buffer,
  mime: string,
  filename: string,
  timeoutMs: number,
): Promise<FormatProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
    formData.append("response_format", "json");
    const r = await fetch(endpoint, { method: "POST", headers, body: formData, signal: controller.signal });
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return { ok: false, latency_ms, error: `HTTP ${r.status}: ${errText}`.slice(0, 200) };
    }
    const data = (await r.json()) as { text?: string };
    return { ok: true, latency_ms, text: (data.text ?? "").trim().slice(0, 200) };
  } catch (e) {
    const latency_ms = Date.now() - t0;
    return { ok: false, latency_ms, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
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
  console.log(`[whisper-test] ricevuto: ${providerId} — ip: ${req.ip}`);
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
        const payload = { ok: false, latency_ms: 0, error: "WHISPER_URL non configurata." };
        console.log(`[whisper-test] home ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
        return;
      }

      const endpoint = whisperUrl.replace(/\/$/, "") + "/inference";
      const headers: Record<string, string> = {};
      if (whisperToken) headers["X-Whisper-Token"] = whisperToken;

      // Prova WAV (formato sicuro) e m4a (formato reale del telefono) in sequenza.
      // Questo permette di capire se un fallback "home" è dovuto al formato o alla connettività.
      const wavResult = await probeHomeFormat(endpoint, headers, wav, "audio/wav", "silence.wav", 15000);
      const m4aResult = await probeHomeFormat(endpoint, headers, buildMinimalM4a(), "audio/x-m4a", "silence.m4a", 10000);

      const latency_ms = Date.now() - start;
      const ok = wavResult.ok;
      console.log(
        `[whisper-test] home ok=${ok} latency_ms=${latency_ms}` +
        ` wav=${wavResult.ok ? "ok" : `fail:${wavResult.error ?? "?"}`}` +
        ` m4a=${m4aResult.ok ? "ok" : `fail:${m4aResult.error ?? "?"}`}`
      );
      res.json({
        ok,
        latency_ms,
        text: wavResult.text,
        error: ok ? undefined : wavResult.error,
        wav: { ok: wavResult.ok, latency_ms: wavResult.latency_ms, error: wavResult.error, text: wavResult.text },
        m4a: { ok: m4aResult.ok, latency_ms: m4aResult.latency_ms, error: m4aResult.error },
      });
      return;
    }

    if (providerId === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        const payload = { ok: false, latency_ms: 0, error: "GROQ_API_KEY non configurata." };
        console.log(`[whisper-test] groq ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
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
          const error = `HTTP ${groqRes.status}: ${errText}`.slice(0, 200);
          console.log(`[whisper-test] groq ok=false latency_ms=${latency_ms} error="${error}"`);
          res.json({ ok: false, latency_ms, error });
          return;
        }
        const data = (await groqRes.json()) as { text?: string };
        const text = (data.text ?? "").trim().slice(0, 200);
        console.log(`[whisper-test] groq ok=true latency_ms=${latency_ms} text="${text}"`);
        res.json({ ok: true, latency_ms, text });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.log(`[whisper-test] groq ok=false latency_ms=${latency_ms} error="${error}"`);
        res.json({ ok: false, latency_ms, error });
      }
      return;
    }

    if (providerId === "openai") {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        const payload = { ok: false, latency_ms: 0, error: "OPENAI_API_KEY non configurata." };
        console.log(`[whisper-test] openai ok=false latency_ms=0 error="${payload.error}"`);
        res.json(payload);
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
          const error = `HTTP ${openaiRes.status}: ${errText}`.slice(0, 200);
          console.log(`[whisper-test] openai ok=false latency_ms=${latency_ms} error="${error}"`);
          res.json({ ok: false, latency_ms, error });
          return;
        }
        const data = (await openaiRes.json()) as { text?: string };
        const text = (data.text ?? "").trim().slice(0, 200);
        console.log(`[whisper-test] openai ok=true latency_ms=${latency_ms} text="${text}"`);
        res.json({ ok: true, latency_ms, text });
      } catch (e) {
        const latency_ms = Date.now() - start;
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        console.log(`[whisper-test] openai ok=false latency_ms=${latency_ms} error="${error}"`);
        res.json({ ok: false, latency_ms, error });
      }
      return;
    }

    sendError(res, 400, "Provider non gestito");
  } catch (err) {
    const latency_ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whisper-test] ${providerId} ok=false latency_ms=${latency_ms} error="${msg}"`);
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
