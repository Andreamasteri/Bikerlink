import { Router, type Request, type Response } from "express";
import multer from "multer";
import { sendError } from "../lib/api-response";

const router = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
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

    if (!whisperUrl) {
      return sendError(res, 503, "Servizio di trascrizione non configurato (WHISPER_URL mancante)");
    }

    const transcribeEndpoint = whisperUrl.replace(/\/$/, "") + "/inference";

    const formData = new FormData();
    const filename = req.file.originalname || "audio.m4a";
    const arrayBuf = req.file.buffer.buffer.slice(
      req.file.buffer.byteOffset,
      req.file.buffer.byteOffset + req.file.buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuf], { type: req.file.mimetype });
    formData.append("file", blob, filename);
    formData.append("response_format", "json");

    const headers: Record<string, string> = {};
    if (whisperToken) {
      headers["X-Whisper-Token"] = whisperToken;
    }

    const whisperRes = await fetch(transcribeEndpoint, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text().catch(() => "");
      console.error(`[Whisper] Server error ${whisperRes.status}: ${errText}`);
      return sendError(res, 502, `Errore dal server Whisper: ${whisperRes.status}`);
    }

    const data = await whisperRes.json() as { text?: string; error?: string };

    if (!data.text) {
      console.error("[Whisper] Risposta senza testo:", data);
      return sendError(res, 502, "Risposta Whisper non valida (nessun testo)");
    }

    return res.json({ text: data.text.trim() });
  } catch (error) {
    console.error("[Whisper] transcribe error:", error);
    return sendError(res, 503, "Servizio Whisper non raggiungibile");
  }
});

export default router;
