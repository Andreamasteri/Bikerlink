import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { storage } from "../../storage";
import { callOllamaChat, isOllamaConfigured } from "../../lib/ollama-client";
import { uploadBuffer, getPublicUrl } from "../../objectStorage";
import { sendSuccess, sendError } from "../../lib/api-response";
import { z } from "zod";

const router = Router();

const txtUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/plain" || file.originalname.endsWith(".txt")) {
      cb(null, true);
    } else {
      cb(new Error("Solo file .txt sono accettati"));
    }
  },
});

const pdfUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Solo file .pdf sono accettati"));
    }
  },
});

const imageUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo file immagine sono accettati (PNG, JPEG, WebP)"));
    }
  },
});

const DOC_KEYS: Record<string, string> = {
  eula: "eula_text",
  privacy: "privacy_policy_text",
  manual: "manual_text",
};

const DOC_LABELS: Record<string, string> = {
  eula: "EULA",
  privacy: "Privacy Policy",
  manual: "Istruzioni/Manuale",
};

function buildPrompt(docType: string): string {
  if (docType === "eula") {
    return `Sei un esperto legale. Genera un EULA (End User License Agreement) completo in italiano per l'applicazione mobile BikerLink.
BikerLink è un'app per motociclisti che permette di trovare compagni di viaggio (matching), pianificare giri in moto, partecipare a motoclub e ricevere assistenza SOS stradale.
Il testo deve essere professionale, conforme alla legge italiana, coprire: licenza d'uso, limitazioni, proprietà intellettuale, esonero di responsabilità, risoluzione delle controversie.
Restituisci SOLO il testo del documento, senza titoli di sezione in markdown, senza asterischi.`;
  }
  if (docType === "privacy") {
    return `Sei un esperto legale GDPR. Genera una Privacy Policy completa in italiano per l'applicazione mobile BikerLink.
BikerLink raccoglie: email, nickname, anno di nascita, paese/regione, tipo utente (biker/zavorrina/coppia), foto, posizione GPS.
Finalità: matching tra motociclisti, chat, giri in moto, SOS stradale, motoclub.
Il testo deve essere conforme al GDPR (Reg. UE 2016/679), includere: titolare del trattamento (BikerLink, privacy@bikerlink.app), basi giuridiche, diritti GDPR, conservazione dati, cookie tecnici.
Restituisci SOLO il testo del documento, senza formattazione markdown.`;
  }
  return `Sei un esperto di UX e documentazione. Genera un manuale utente completo in italiano per l'app mobile BikerLink.
Sezioni da coprire: registrazione e accesso, completamento profilo, matching con altri biker, pianificazione giri in moto, motoclub (unirsi, chat di gruppo), funzione SOS stradale, impostazioni e privacy.
Tono: amichevole, chiaro, adatto a motociclisti di tutte le età.
Restituisci SOLO il testo del manuale, formattato con sezioni numerate.`;
}

router.get("/docs-info", async (_req: Request, res: Response) => {
  try {
    const [eula, privacy, manual, manualMeta] = await Promise.all([
      storage.getAppSetting("eula_text"),
      storage.getAppSetting("privacy_policy_text"),
      storage.getAppSetting("manual_text"),
      storage.getAppSetting("manual_file_meta"),
    ]);

    const toInfo = (setting: { value?: string | null; updatedAt?: Date | null } | null | undefined, label: string) => ({
      label,
      hasContent: !!(setting?.value),
      preview: setting?.value ? setting.value.slice(0, 200) : null,
      updatedAt: setting?.updatedAt ?? null,
    });

    const manualFileMeta = (manualMeta?.valueJson as { fileName?: string; fileSize?: number; uploadedAt?: string } | null) ?? null;

    const manualTextInfo = toInfo(manual, "Istruzioni");
    const manualHasContent = manualTextInfo.hasContent || !!manualFileMeta;
    const manualUpdatedAt = (() => {
      const textDate = manual?.updatedAt ? new Date(manual.updatedAt) : null;
      const fileDate = manualFileMeta?.uploadedAt ? new Date(manualFileMeta.uploadedAt) : null;
      if (textDate && fileDate) return textDate > fileDate ? textDate : fileDate;
      return textDate ?? fileDate ?? null;
    })();

    return res.json({
      eula: toInfo(eula, "EULA"),
      privacy: toInfo(privacy, "Privacy Policy"),
      manual: {
        ...manualTextInfo,
        hasContent: manualHasContent,
        updatedAt: manualUpdatedAt,
        fileMeta: manualFileMeta,
      },
      isOllamaConfigured,
    });
  } catch (err) {
    console.error("[legal] docs-info error:", err);
    return sendError(res, 500, "Errore lettura documenti");
  }
});

const generateSchema = z.object({
  docType: z.enum(["eula", "privacy", "manual"]),
});

router.post("/generate", async (req: Request, res: Response) => {
  try {
    if (!isOllamaConfigured) {
      return sendError(res, 503, "Ollama non configurato: impossibile generare il documento.");
    }

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const { docType } = parsed.data;

    const prompt = buildPrompt(docType);
    const text = await callOllamaChat(prompt, undefined, { temperature: 0.3, maxRetries: 1 });

    return res.json({ ok: true, docType, text });
  } catch (err) {
    console.error("[legal] generate error:", err);
    return sendError(res, 500, `Errore generazione documento: ${(err as Error).message}`);
  }
});

router.post("/upload/:docType", (req: Request, res: Response, next) => {
  const docType = req.params.docType as string;
  if (docType === "manual") {
    pdfUpload.single("file")(req, res, next);
  } else {
    txtUpload.single("file")(req, res, next);
  }
}, async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as string;
    if (!DOC_KEYS[docType]) return sendError(res, 400, "Tipo documento non valido");
    if (!req.file) return sendError(res, 400, "Nessun file caricato");

    const settingKey = DOC_KEYS[docType];

    if (docType === "manual") {
      const fileBuffer = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
      const objectPath = `public/docs/bikerlink-manual.pdf`;
      await uploadBuffer(objectPath, fileBuffer, "application/pdf");
      const url = await getPublicUrl(objectPath);
      await storage.upsertAppSetting("manual_file_url", url);
      await storage.upsertAppSetting("manual_file_meta", undefined, {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedAt: new Date().toISOString(),
      });
      await storage.createModeratorLog({
        moderatorId: req.session.userId!,
        action: "upload_legal_doc",
        targetType: "app_setting",
        targetId: settingKey,
        details: `Manuale PDF caricato: ${req.file.originalname}`,
      });
      return sendSuccess(res, { url }, "Manuale caricato con successo");
    } else {
      const content = fs.readFileSync(req.file.path, "utf-8");
      fs.unlinkSync(req.file.path);
      return sendSuccess(res, { text: content }, `${DOC_LABELS[docType]} caricato`);
    }
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("[legal] upload error:", err);
    return sendError(res, 500, "Errore upload documento");
  }
});

const saveDocSchema = z.object({
  text: z.string().min(1).max(500_000),
});

router.post("/save/:docType", async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as string;
    if (!DOC_KEYS[docType]) return sendError(res, 400, "Tipo documento non valido");
    const parsed = saveDocSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const settingKey = DOC_KEYS[docType];
    await storage.upsertAppSetting(settingKey, parsed.data.text);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "save_legal_doc",
      targetType: "app_setting",
      targetId: settingKey,
      details: `${DOC_LABELS[docType]} attivato nell'app (${parsed.data.text.length} caratteri)`,
    });
    const updated = await storage.getAppSetting(settingKey);
    return res.json({ ok: true, updatedAt: updated?.updatedAt ?? new Date() });
  } catch (err) {
    console.error("[legal] save error:", err);
    return sendError(res, 500, "Errore salvataggio documento");
  }
});

router.get("/download/:docType", async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as string;
    if (!DOC_KEYS[docType]) return sendError(res, 400, "Tipo documento non valido");

    if (docType === "manual") {
      const [manualUrl, manualText] = await Promise.all([
        storage.getAppSetting("manual_file_url"),
        storage.getAppSetting("manual_text"),
      ]);

      if (manualUrl?.value) {
        return res.redirect(manualUrl.value);
      }

      if (manualText?.value) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="bikerlink-manual.txt"`);
        return res.send(manualText.value);
      }

      return sendError(res, 404, "Manuale non disponibile");
    }

    const settingKey = DOC_KEYS[docType];
    const setting = await storage.getAppSetting(settingKey);
    if (!setting?.value) return sendError(res, 404, "Documento non disponibile");

    const filename = `bikerlink-${docType}.txt`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(setting.value);
  } catch (err) {
    console.error("[legal] download error:", err);
    return sendError(res, 500, "Errore download documento");
  }
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
        const objectPath = `public/ads/${filename}`;
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
    const objectPath = `public/ads/${filename}`;
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
