/**
 * legal.next.ts — companion di legal.ts
 *
 * Contenuto:
 *   - POST /generate-slides  — genera slide esplicative BikerLink con Ollama (SVG→PNG)
 *   - POST /publish-slides   — pubblica le slide come AdCampaign sponsor=BikerLink
 *   - POST /upload-slide-image — carica un'immagine PNG/JPEG come slide
 *   - GET  /current-slides   — legge le campagne slide BikerLink attive
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { storage } from "../../storage";
import { callOllamaChat, isOllamaConfigured } from "../../lib/ollama-client";
import { uploadBuffer, BUCKET_CAMPAIGN } from "../../objectStorage";
import { sendError } from "../../lib/api-response";
import { z } from "zod";

const router = Router();

const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg"];

const imageUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo file PNG o JPEG sono accettati"));
    }
  },
});

interface SlideJson {
  title: string;
  body: string;
}

function buildSlidesSvg(slide: SlideJson, index: number, total: number): string {
  const bg = "#0D1117";
  const accent = "#FF6B35";
  const textColor = "#F0F6FC";
  const subColor = "#8B949E";

  const escapeXml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const titleText = escapeXml(slide.title ?? "");
  const bodyText = escapeXml(slide.body ?? "");

  const wordWrap = (text: string, maxChars: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length <= maxChars) {
        current = (current + " " + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const bodyLines = wordWrap(bodyText, 72);
  const bodyElements = bodyLines
    .slice(0, 5)
    .map((line, i) => `<text x="80" y="${340 + i * 44}" font-size="28" fill="${subColor}" font-family="Arial,sans-serif">${line}</text>`)
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="600">
  <rect width="1080" height="600" fill="${bg}"/>
  <rect x="0" y="0" width="6" height="600" fill="${accent}"/>
  <rect x="0" y="560" width="1080" height="40" fill="${accent}" opacity="0.15"/>
  <text x="80" y="70" font-size="22" fill="${accent}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="3">BIKERLINK</text>
  <text x="80" y="120" font-size="18" fill="${subColor}" font-family="Arial,sans-serif">Come funziona l'app</text>
  <line x1="80" y1="140" x2="1000" y2="140" stroke="${accent}" stroke-width="1" opacity="0.4"/>
  <text x="80" y="230" font-size="44" fill="${textColor}" font-family="Arial,sans-serif" font-weight="bold">${titleText}</text>
  ${bodyElements}
  <text x="1000" y="585" font-size="18" fill="${accent}" font-family="Arial,sans-serif" text-anchor="end">${index + 1} / ${total}</text>
</svg>`;
}

const generateSlidesSchema = z.object({
  numSlides: z.number().int().min(1).max(20).optional().default(6),
  customPrompt: z.string().max(2000).optional(),
});

const DEFAULT_SLIDES_PROMPT = (n: number) =>
  `Sei un esperto di marketing per app mobile. Genera un array JSON di ${n} slide "come funziona BikerLink" in italiano.\nBikerLink è un'app per motociclisti con: matching tra biker, pianificazione giri, motoclub, SOS stradale, chat, raduni.\nOgni slide ha: "title" (max 6 parole, impattante) e "body" (max 30 parole, descrizione concisa della funzione).\nRestituisci SOLO un array JSON valido, senza markdown, senza commenti, esempio:\n[{"title":"Trova il tuo biker","body":"Descrizione..."},...]`;

router.post("/generate-slides", async (req: Request, res: Response) => {
  try {
    if (!isOllamaConfigured) {
      return sendError(res, 503, "Ollama non configurato: impossibile generare le slide.");
    }

    const parsed = generateSlidesSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { numSlides, customPrompt } = parsed.data;

    const slidesPrompt = customPrompt?.trim()
      ? customPrompt.trim()
      : DEFAULT_SLIDES_PROMPT(numSlides);

    let slides: SlideJson[];
    try {
      const { z: zod } = await import("zod");
      const slideSchema = zod.array(zod.object({ title: zod.string(), body: zod.string() })).min(1).max(20);
      slides = await callOllamaChat(slidesPrompt, slideSchema, { temperature: 0.4, maxRetries: 2, jsonRetries: 2 });
      slides = slides.slice(0, numSlides);
    } catch (ollamaErr) {
      console.error("[legal/slides] Ollama error:", ollamaErr);
      return sendError(res, 500, `Errore generazione slide: ${(ollamaErr as Error).message}`);
    }

    const sharp = (await import("sharp")).default;
    const generated: { title: string; imageUrl: string }[] = [];
    const ts = Date.now();

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      try {
        const svg = buildSlidesSvg(slide, i, slides.length);
        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
        const filename = `slide-bikerlink-${ts}-${i}.png`;
        const objectPath = `${BUCKET_CAMPAIGN}${filename}`;
        await uploadBuffer(objectPath, pngBuffer, "image/png");
        const imageUrl = `/api/ads/images/${filename}`;
        generated.push({ title: slide.title, imageUrl });
      } catch (slideErr) {
        console.warn(`[legal/slides] Slide ${i} failed:`, slideErr);
      }
    }

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "generate_slides_preview",
      targetType: "campaign",
      targetId: "bulk",
      details: `Generate ${generated.length} slide esplicative BikerLink (anteprima, non ancora pubblicate)`,
    });

    return res.json({ ok: true, slides: generated });
  } catch (err) {
    console.error("[legal/slides] error:", err);
    return sendError(res, 500, `Errore generazione slide: ${(err as Error).message}`);
  }
});

const publishSlidesSchema = z.object({
  slides: z.array(z.object({ title: z.string(), imageUrl: z.string() })).min(1).max(20),
});

router.post("/publish-slides", async (req: Request, res: Response) => {
  try {
    const parsed = publishSlidesSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { slides } = parsed.data;

    const created: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const { title, imageUrl } = slides[i];
      try {
        await storage.createAdCampaign({
          name: title,
          sponsor: "BikerLink",
          imageUrl,
          linkUrl: null,
          displayMode: "banner",
          targetUserType: "tutti",
          rotationDuration: 10,
          rotationMode: "sequential",
          sortOrder: i,
          startDate: null,
          endDate: null,
          placement: "home",
          isActive: true,
        });
        created.push(title);
      } catch (slideErr) {
        console.warn(`[legal/publish-slides] Slide ${i} failed:`, slideErr);
      }
    }

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "publish_slides",
      targetType: "campaign",
      targetId: "bulk",
      details: `Pubblicate ${created.length} slide esplicative BikerLink come campagne`,
    });

    return res.json({ ok: true, created: created.length, slides: created });
  } catch (err) {
    console.error("[legal/publish-slides] error:", err);
    return sendError(res, 500, `Errore pubblicazione slide: ${(err as Error).message}`);
  }
});

router.post("/upload-slide-image", imageUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file caricato");

    const fileBuffer = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);

    const ts = Date.now();
    const ext = req.file.mimetype === "image/png" ? "png" : "jpg";
    const filename = `slide-upload-${ts}.${ext}`;
    const objectPath = `${BUCKET_CAMPAIGN}${filename}`;
    await uploadBuffer(objectPath, fileBuffer, req.file.mimetype);

    const imageUrl = `/api/ads/images/${filename}`;
    const title = path.basename(req.file.originalname ?? filename, path.extname(req.file.originalname ?? filename));

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_slide_image",
      targetType: "campaign",
      targetId: "upload",
      details: `Slide PNG caricata manualmente: ${filename}`,
    });

    return res.json({ ok: true, imageUrl, title });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("[legal/upload-slide] error:", err);
    return sendError(res, 500, `Errore upload slide: ${(err as Error).message}`);
  }
});

router.get("/current-slides", async (_req: Request, res: Response) => {
  try {
    const all = await storage.getAllCampaigns();
    const slides = all
      .filter((c) => c.sponsor === "BikerLink" && c.placement === "home")
      .map((c) => ({ id: c.id, title: c.name, imageUrl: c.imageUrl ?? "", isActive: c.isActive ?? false }));
    return res.json({ ok: true, slides });
  } catch (err) {
    console.error("[legal/current-slides] error:", err);
    return sendError(res, 500, "Errore lettura campagne slide");
  }
});

export default router;
