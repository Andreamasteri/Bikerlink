import { Router, type Request, type Response } from "express";
import multer from "multer";
import { sendError } from "../lib/api-response";
import { getEffectiveSttChain } from "../ai/whisper-provider-config";
import { isThinkCentreOffline } from "../lib/thinkcentre-offline";
import { cfAccessHeaders } from "../lib/cf-access";

const router = Router();

const ACCEPTED_AUDIO_MIME = new Set([
  "application/octet-stream",
  "audio/x-m4a",
  "audio/mp4",
]);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || ACCEPTED_AUDIO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato audio non supportato."));
    }
  },
});

router.post("/transcribe", audioUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const session = req.session as { userId?: string };
    if (!session?.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    if (!req.file) {
      return sendError(res, 400, "Nessun file audio ricevuto");
    }

    const filename = req.file.originalname || "audio.m4a";
    const mimetype = req.file.mimetype;
    const arrayBuf = req.file.buffer.buffer.slice(
      req.file.buffer.byteOffset,
      req.file.buffer.byteOffset + req.file.buffer.byteLength
    ) as ArrayBuffer;

    const rawLang = typeof req.body?.language === "string" ? req.body.language.trim() : "";
    const lang = /^[a-z]{2}$/.test(rawLang) ? rawLang : "it";

    const chain = await getEffectiveSttChain();

    for (const providerId of chain) {
      if (providerId === "home") {
        const whisperUrl = process.env.WHISPER_URL;
        const whisperToken = process.env.WHISPER_TOKEN;
        if (!whisperUrl) continue;

        // ThinkCentre offline (spento O in manutenzione): salta subito Whisper
        // di casa senza attendere il timeout di 15s — passa al provider cloud.
        if (await isThinkCentreOffline()) {
          console.warn("[whisper/home] ThinkCentre offline (spento o in manutenzione) — skip al cloud");
          continue;
        }

        const homeStart = Date.now();
        try {
          const transcribeEndpoint = whisperUrl.replace(/\/$/, "") + "/inference";
          const formData = new FormData();
          const blob = new Blob([arrayBuf], { type: mimetype });
          formData.append("file", blob, filename);
          formData.append("response_format", "json");
          formData.append("language", lang);

          const headers: Record<string, string> = { ...cfAccessHeaders() };
          if (whisperToken) {
            headers["X-Whisper-Token"] = whisperToken;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          let whisperRes: Awaited<ReturnType<typeof fetch>>;
          try {
            whisperRes = await fetch(transcribeEndpoint, {
              method: "POST",
              headers,
              body: formData,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }

          if (!whisperRes.ok) {
            const errText = await whisperRes.text().catch(() => "");
            throw new Error(`Server di casa error ${whisperRes.status}: ${errText}`);
          }

          const data = (await whisperRes.json()) as { text?: string; error?: string };
          if (!data.text) {
            throw new Error("Risposta Whisper di casa non valida (nessun testo)");
          }

          return res.json({ text: data.text.trim(), source: "home" });
        } catch (homeErr) {
          const msg = homeErr instanceof Error ? homeErr.message : String(homeErr);
          const latencyMs = Date.now() - homeStart;
          const errType =
            homeErr instanceof Error && homeErr.name === "AbortError"
              ? "timeout"
              : msg.startsWith("Server di casa error")
                ? "http"
                : "network";
          console.warn(
            `[whisper/home] fallito — motivo: ${msg} | latenza: ${latencyMs}ms | tipo: ${errType}`
          );
        }
        continue;
      }

      if (providerId === "groq") {
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) continue;

        try {
          const formData = new FormData();
          const blob = new Blob([arrayBuf], { type: mimetype });
          formData.append("file", blob, filename);
          formData.append("model", "whisper-large-v3-turbo");
          formData.append("response_format", "json");
          formData.append("language", lang);

          const groqController = new AbortController();
          const groqTimeout = setTimeout(() => groqController.abort(), 20000);
          let groqRes: Awaited<ReturnType<typeof fetch>>;
          try {
            groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
              method: "POST",
              headers: { Authorization: `Bearer ${groqKey}`, "Accept-Encoding": "identity" },
              body: formData,
              signal: groqController.signal,
            });
          } finally {
            clearTimeout(groqTimeout);
          }

          if (!groqRes.ok) {
            const errText = await groqRes.text().catch(() => "");
            if (groqRes.status === 429) {
              console.warn(`[Whisper] Groq rate-limit, passo al successivo`);
            } else {
              console.warn(`[Whisper] Groq error ${groqRes.status}: ${errText}, passo al successivo`);
            }
            throw new Error(`Groq error ${groqRes.status}`);
          }

          const groqRaw = await groqRes.text().catch(() => "");
          if (groqRaw.charCodeAt(0) === 0) {
            const enc = groqRes.headers.get("content-encoding") ?? "unknown";
            console.warn(`[Whisper] Groq risposta binaria/compressa non parsabile (content-encoding: ${enc})`);
            throw new Error(`Groq risposta binaria/compressa (content-encoding: ${enc})`);
          }
          const data = JSON.parse(groqRaw) as { text?: string };
          if (!data.text) {
            throw new Error("Risposta Groq senza testo");
          }

          return res.json({ text: data.text.trim(), source: "cloud", providerId: "groq" });
        } catch (groqErr) {
          const msg = groqErr instanceof Error ? groqErr.message : String(groqErr);
          console.warn(`[Whisper] Provider "groq" non disponibile, passo al successivo: ${msg}`);
        }
        continue;
      }

      if (providerId === "openai") {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) continue;

        try {
          const formData = new FormData();
          const blob = new Blob([arrayBuf], { type: mimetype });
          formData.append("file", blob, filename);
          formData.append("model", "whisper-1");
          formData.append("response_format", "json");
          formData.append("language", lang);

          const openaiController = new AbortController();
          const openaiTimeout = setTimeout(() => openaiController.abort(), 25000);
          let openaiRes: Awaited<ReturnType<typeof fetch>>;
          try {
            openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: { Authorization: `Bearer ${openaiKey}`, "Accept-Encoding": "identity" },
              body: formData,
              signal: openaiController.signal,
            });
          } finally {
            clearTimeout(openaiTimeout);
          }

          if (!openaiRes.ok) {
            const errText = await openaiRes.text().catch(() => "");
            console.warn(`[Whisper] OpenAI error ${openaiRes.status}: ${errText}`);
            if (openaiRes.status === 429) {
              console.warn(`[Whisper] OpenAI rate-limit, passo al successivo`);
            }
            throw new Error(`OpenAI error ${openaiRes.status}`);
          }

          const openaiRaw = await openaiRes.text().catch(() => "");
          if (openaiRaw.charCodeAt(0) === 0) {
            const enc = openaiRes.headers.get("content-encoding") ?? "unknown";
            console.warn(`[Whisper] OpenAI risposta binaria/compressa non parsabile (content-encoding: ${enc})`);
            throw new Error(`OpenAI risposta binaria/compressa (content-encoding: ${enc})`);
          }
          const data = JSON.parse(openaiRaw) as { text?: string };
          if (!data.text) {
            throw new Error("Risposta OpenAI senza testo");
          }

          return res.json({ text: data.text.trim(), source: "cloud", providerId: "openai" });
        } catch (cloudErr) {
          const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
          console.warn(`[Whisper] Provider "openai" non disponibile: ${msg}`);
        }
        continue;
      }
    }

    return sendError(res, 503, "Nessun provider di trascrizione disponibile o configurato");
  } catch (error) {
    console.error("[Whisper] transcribe error:", error);
    return sendError(res, 503, "Servizio Whisper non raggiungibile");
  }
});

export default router;
