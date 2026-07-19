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
    // stream:true → Ollama stream:true via doStream → CF riceve token subito (no 524 timeout).
    // Documenti legali non hanno numPredict esplicito: il default Ollama è 2048+ token,
    // sufficiente a superare i 100s di idle CF senza streaming.
    const text = await callOllamaChat(prompt, undefined, { temperature: 0.3, maxRetries: 1, stream: true });

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

router.get("/text/:docType", async (req: Request, res: Response) => {
  try {
    const docType = req.params.docType as string;
    if (!DOC_KEYS[docType]) return sendError(res, 400, "Tipo documento non valido");

    if (docType === "manual") {
      const [manualText, manualUrl] = await Promise.all([
        storage.getAppSetting("manual_text"),
        storage.getAppSetting("manual_file_url"),
      ]);
      if (manualText?.value) return res.json({ ok: true, text: manualText.value, isPdf: false });
      if (manualUrl?.value) return res.json({ ok: true, text: null, isPdf: true });
      return sendError(res, 404, "Manuale non disponibile");
    }

    const settingKey = DOC_KEYS[docType];
    const setting = await storage.getAppSetting(settingKey);
    if (!setting?.value) return sendError(res, 404, "Documento non disponibile");
    return res.json({ ok: true, text: setting.value, isPdf: false });
  } catch (err) {
    console.error("[legal] text error:", err);
    return sendError(res, 500, "Errore lettura documento");
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

export default router;

// ── Slides code moved to legal.next.ts ──────────────────────────────────────
// generate-slides, publish-slides, upload-slide-image, current-slides are in
