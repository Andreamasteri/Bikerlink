import { Router, type Request, type Response } from "express";
import multer from "multer";
import { sendError } from "../lib/api-response";

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

    const whisperUrl = process.env.WHISPER_URL;
    const whisperToken = process.env.WHISPER_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!whisperUrl && !openaiKey) {
      return sendError(
        res,
        503,
        "Servizio di trascrizione non configurato (WHISPER_URL e OPENAI_API_KEY mancanti)"
      );
    }

    const filename = req.file.originalname || "audio.m4a";
    const mimetype = req.file.mimetype;
    const arrayBuf = req.file.buffer.buffer.slice(
      req.file.buffer.byteOffset,
      req.file.buffer.byteOffset + req.file.buffer.byteLength
    ) as ArrayBuffer;

    // 1) Tentativo sul server di casa (Whisper self-hosted su ThinkCentre).
    if (whisperUrl) {
      try {
        const transcribeEndpoint = whisperUrl.replace(/\/$/, "") + "/inference";

        const formData = new FormData();
        const blob = new Blob([arrayBuf], { type: mimetype });
        formData.append("file", blob, filename);
        formData.append("response_format", "json");

        const headers: Record<string, string> = {};
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
        console.warn(`[Whisper] Server di casa non disponibile, fallback cloud: ${msg}`);
        // prosegue verso il fallback OpenAI
      }
    }

    // 2) Fallback su OpenAI Whisper API (cloud).
    if (!openaiKey) {
      return sendError(res, 502, "Server di casa non raggiungibile e fallback cloud non configurato");
    }

    try {
      const formData = new FormData();
      const blob = new Blob([arrayBuf], { type: mimetype });
      formData.append("file", blob, filename);
      formData.append("model", "whisper-1");
      formData.append("response_format", "json");

      const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text().catch(() => "");
        console.error(`[Whisper] OpenAI error ${openaiRes.status}: ${errText}`);
        if (openaiRes.status === 429) {
          return sendError(res, 429, "Trascrizione vocale: limite di utilizzo raggiunto, riprova tra qualche minuto");
        }
        return sendError(res, 502, `Trascrizione vocale non disponibile (${openaiRes.status})`);
      }

      const data = (await openaiRes.json()) as { text?: string };

      if (!data.text) {
        console.error("[Whisper] Risposta OpenAI senza testo:", data);
        return sendError(res, 502, "Risposta cloud non valida (nessun testo)");
      }

      return res.json({ text: data.text.trim(), source: "cloud" });
    } catch (cloudErr) {
      console.error("[Whisper] Fallback cloud error:", cloudErr);
      return sendError(res, 503, "Servizio di trascrizione non raggiungibile");
    }
  } catch (error) {
    console.error("[Whisper] transcribe error:", error);
    return sendError(res, 503, "Servizio Whisper non raggiungibile");
  }
});

export default router;
