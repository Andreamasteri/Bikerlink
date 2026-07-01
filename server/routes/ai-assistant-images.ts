// Task #5327 — Pipeline immagini per l'AI Assistant (Bowie).
// - POST /ai/assistant/images  → upload di un'immagine (multipart, max 10MB),
//   salvata su object storage sotto private/assistant-images/<filename>.
// - GET  /ai/assistant/images/:filename → serve l'immagine (sessione richiesta).
// Il route del messaggio (ai-assistant.ts) risolve gli imageUrls in base64 via
// resolveAssistantImageBuffer() e li passa all'agent per il path multimodale
// (vision) sui provider cloud.
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireUser } from "./ai-assistant-helpers";
import { sendError } from "../lib/api-response";
import { uploadBuffer, downloadBuffer } from "../objectStorage";

const router = Router();

// Prefisso object storage dedicato (privato). I filename sono random/unguessable
// e la serve richiede sessione: doppia difesa contro l'enumerazione.
const IMAGE_PREFIX = "private/assistant-images";

// Estensioni/MIME ammessi. La chiave è l'estensione (lowercase, senza punto).
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

// Filename servibile: solo caratteri sicuri + estensione whitelistata (no traversal).
const FILENAME_REGEX = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|heic)$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error("Formato immagine non supportato"));
  },
});

// ── POST /images — upload ─────────────────────────────────────────────────
router.post(
  "/ai/assistant/images",
  requireUser,
  (req: Request, res: Response) => {
    upload.single("image")(req, res, async (err: unknown) => {
      if (err) {
        sendError(res, 400, (err as Error).message || "Upload immagine fallito");
        return;
      }
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) { sendError(res, 400, "Nessuna immagine ricevuta"); return; }

      const ext = EXT_BY_MIME[file.mimetype];
      if (!ext) { sendError(res, 400, "Formato immagine non supportato"); return; }

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      try {
        await uploadBuffer(`${IMAGE_PREFIX}/${filename}`, file.buffer, file.mimetype);
        res.json({ url: `/api/ai/assistant/images/${filename}` });
      } catch (e) {
        console.error("[ai-assistant/images/upload]", e);
        sendError(res, 500, "Salvataggio immagine fallito");
      }
    });
  },
);

// ── GET /images/:filename — serve ─────────────────────────────────────────
router.get(
  "/ai/assistant/images/:filename",
  requireUser,
  async (req: Request, res: Response) => {
    const filename = String(req.params.filename ?? "");
    if (!FILENAME_REGEX.test(filename)) { sendError(res, 400, "Nome file non valido"); return; }
    const ext = filename.split(".").pop()!.toLowerCase();
    try {
      const buffer = await downloadBuffer(`${IMAGE_PREFIX}/${filename}`);
      res.setHeader("Content-Type", MIME_BY_EXT[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(buffer);
    } catch (e) {
      console.error("[ai-assistant/images/serve]", (e as Error).message);
      sendError(res, 404, "Immagine non trovata");
    }
  },
);

/**
 * Risolve un imageUrl (relativo, es. "/api/ai/assistant/images/<file>") nel
 * contenuto base64 + mediaType, leggendolo direttamente da object storage.
 * Usato server-side dal route del messaggio per costruire il contenuto
 * multimodale da passare all'agent (i provider cloud non possono fare fetch di
 * URL autenticati). Ritorna null se l'URL non è valido o il file non esiste.
 */
export async function resolveAssistantImageBuffer(
  imageUrl: string,
): Promise<{ base64: string; mediaType: string } | null> {
  const filename = imageUrl.split("/").pop() ?? "";
  if (!FILENAME_REGEX.test(filename)) return null;
  const ext = filename.split(".").pop()!.toLowerCase();
  const mediaType = MIME_BY_EXT[ext];
  if (!mediaType) return null;
  try {
    const buffer = await downloadBuffer(`${IMAGE_PREFIX}/${filename}`);
    return { base64: buffer.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

export default router;
