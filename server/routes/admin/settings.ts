import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { invalidateIdleKillCache } from "../../ai/watchdog/collectors/pool-collector";
import bcrypt from "bcryptjs";
import { emailConfigSchema, disableFeatureSchema, toggleProtectedSchema, mapsProviderSchema, themeDefaultSchema, matchingCountriesSchema, coordinatesMaxAgeSchema, genericSettingSchema, nativeVersionSchema, urlSettingSchema } from "@shared/validators";
import { sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendSuccess, sendError } from "../../lib/api-response";
import { isGlobalVisibilityOn } from "../../fake-activity";

const router = Router();

const eulaUpload = multer({
  dest: path.join(process.cwd(), "uploads", "tmp"),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Solo file .txt (text/plain) sono accettati"));
    }
  },
});

const apkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (_error) {
    console.error("Admin get settings error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/email-config", async (_req: Request, res: Response) => {
  try {
    // SMTP credentials live EXCLUSIVELY in environment secrets
    // (GMAIL_USER / GMAIL_APP_PASSWORD). Non si leggono più da app_settings:
    // i segreti nel DB operativo allargano la superficie di esposizione.
    const envUser = process.env.GMAIL_USER || null;
    const hasEnvPass = !!process.env.GMAIL_APP_PASSWORD;
    return res.json({
      gmailUser: envUser,
      gmailAppPassword: hasEnvPass ? "••••••••" : null,
      configured: !!(envUser && hasEnvPass),
    });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura config email");
  }
});

router.put("/email-config", async (req: Request, res: Response) => {
  try {
    const parsedEc = emailConfigSchema.safeParse(req.body);
    if (!parsedEc.success) return sendError(res, 400, parsedEc.error.issues[0].message);
    const { adminPassword } = parsedEc.data;

    const userId = req.session?.userId;
    if (!userId) return sendError(res, 401, "Non autenticato");
    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 401, "Utente non trovato");
    if (user.role !== "admin") return sendError(res, 403, "Accesso riservato agli admin");
    const valid = await bcrypt.compare(adminPassword, user.password);
    if (!valid) return sendError(res, 403, "Password admin non valida");

    // SMTP credentials are managed EXCLUSIVELY via environment secrets
    // (GMAIL_USER / GMAIL_APP_PASSWORD) and are no longer persisted to
    // app_settings — storing secrets in operational data is a security risk
    // (task #5086). Legacy rows are purged by the boot cleanup in
    // server/boot-phase3-db-init.ts.
    return sendError(
      res,
      400,
      "Le credenziali SMTP sono gestite solo tramite i secret di ambiente (GMAIL_USER / GMAIL_APP_PASSWORD) e non vengono più salvate nel database.",
    );
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio config email");
  }
});

router.put("/disable-feature", async (req: Request, res: Response) => {
  try {
    const parsedDf = disableFeatureSchema.safeParse(req.body);
    if (!parsedDf.success) return sendError(res, 400, parsedDf.error.issues[0].message);
    const { key, disabled } = parsedDf.data;
    const setting = await storage.upsertAppSetting(`disable_${key}`, undefined, disabled);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore disabilitazione feature");
  }
});

router.put("/toggle-protected", async (req: Request, res: Response) => {
  try {
    const parsedTp = toggleProtectedSchema.safeParse(req.body);
    if (!parsedTp.success) return sendError(res, 400, parsedTp.error.issues[0].message);
    const { key, value, adminPassword } = parsedTp.data;

    if (key === "syneco_branding_visible") {
      if (!adminPassword) return sendError(res, 400, "Password admin richiesta per questo toggle");
      const userId = req.session?.userId;
      if (!userId) return sendError(res, 401, "Non autenticato");
      const user = await storage.getUser(userId);
      if (!user) return sendError(res, 401, "Utente non trovato");
      const valid = await bcrypt.compare(adminPassword, user.password);
      if (!valid) return sendError(res, 403, "Password admin non valida");
    }

    const setting = await storage.upsertAppSetting(key, value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore toggle protetto");
  }
});

router.put("/motoclub_include_zav", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("motoclub_include_zav", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/show_search_preference", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("show_search_preference", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/match_preferences_visible", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("match_preferences_visible", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/search_preference_locked", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("search_preference_locked", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/maps_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("maps_enabled", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/primal_user_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("primal_user_enabled", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/chatbot_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    // Cascade invariant: chatbot is a stregatti sub-option — it cannot be
    // enabled while "Visibilità Globale" (fake_users_enabled) is OFF.
    if (val && !(await isGlobalVisibilityOn())) {
      return sendError(res, 409, "Attiva prima la Visibilità Globale per abilitare il chatbot stregatti");
    }
    const setting = await storage.upsertAppSetting("chatbot_enabled", val ? "true" : "false");
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/maps_provider", async (req: Request, res: Response) => {
  try {
    const parsed = mapsProviderSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("maps_provider", parsed.data.value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio provider mappe");
  }
});

router.put("/theme_user_switching_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("theme_user_switching_enabled", undefined, val);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.put("/theme_default", async (req: Request, res: Response) => {
  try {
    const parsed = themeDefaultSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("theme_default", parsed.data.value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio tema");
  }
});

router.get("/matching_countries", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("matching_countries");
    return res.json(setting?.value || []);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura paesi");
  }
});

router.put("/matching_countries", async (req: Request, res: Response) => {
  try {
    const parsed = matchingCountriesSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("matching_countries", undefined, parsed.data.value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio paesi");
  }
});

router.get("/coordinates_max_age_seconds", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("coordinates_max_age_seconds");
    return res.json({ value: setting?.value || 3600 });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura max age");
  }
});

router.put("/coordinates_max_age_seconds", async (req: Request, res: Response) => {
  try {
    const parsed = coordinatesMaxAgeSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("coordinates_max_age_seconds", undefined, parsed.data.value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio max age");
  }
});

router.put("/support-email", async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (typeof value !== "string") return sendError(res, 400, "Valore non valido");
    const setting = await storage.upsertAppSetting("support_email", value);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio email supporto");
  }
});

const WA_NUMBER_REGEX = /^\+?[1-9]\d{6,14}$/;

function normalizeWaNumber(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

router.put("/support-whatsapp", async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (typeof value !== "string") return sendError(res, 400, "Valore non valido");
    const trimmed = value.trim();
    if (trimmed !== "") {
      const normalized = normalizeWaNumber(trimmed);
      if (!WA_NUMBER_REGEX.test(normalized)) {
        return sendError(res, 400, "Numero WhatsApp non valido. Usa formato internazionale es. +39XXXXXXXXXX");
      }
    }
    const setting = await storage.upsertAppSetting("support_whatsapp", trimmed);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio WhatsApp supporto");
  }
});

// NOTE: these specific PUT handlers MUST stay before the generic /:key handler
// below — Express matches routes in declaration order and /:key would intercept
// them first, saving to the wrong DB key (hyphenated path instead of underscored).

router.put("/tc-terminal-apk-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("tc_terminal_apk_url", parsed.data.url);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio TC Terminal APK URL");
  }
});

router.put("/play-store-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("play_store_url", parsed.data.url);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio Play Store URL");
  }
});

router.put("/native-version", async (req: Request, res: Response) => {
  try {
    const parsed = nativeVersionSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("native_version", undefined, parsed.data);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio native version");
  }
});

router.put("/apk-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("apk_download_url", parsed.data.url);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio APK URL");
  }
});

router.put("/app-store-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting("app_store_url", parsed.data.url);
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio App Store URL");
  }
});

router.put("/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const parsed = genericSettingSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);
    const setting = await storage.upsertAppSetting(key, undefined, parsed.data.value);
    // Invalida immediatamente la cache TTL del pool-collector in modo che il
    // prossimo probe idle-leak rilegga il valore aggiornato senza attendere
    // fino a 3 minuti (scadenza naturale della cache).
    if (key === "db_idle_conn_kill_enabled") {
      invalidateIdleKillCache();
    }
    return res.json(setting);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio setting");
  }
});

router.post("/eula/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file caricato");
    const content = fs.readFileSync(req.file.path, "utf-8");
    fs.unlinkSync(req.file.path);
    const setting = await storage.upsertAppSetting("eula_text", content);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_eula",
      targetType: "app_setting",
      targetId: "eula_text",
      details: "EULA caricato da file .txt",
    });
    return sendSuccess(res, { value: content, setting }, "EULA caricato con successo");
  } catch (_error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return sendError(res, 500, "Errore caricamento EULA");
  }
});

router.post("/privacy-policy/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file caricato");
    const content = fs.readFileSync(req.file.path, "utf-8");
    fs.unlinkSync(req.file.path);
    const setting = await storage.upsertAppSetting("privacy_policy_text", content);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_privacy_policy",
      targetType: "app_setting",
      targetId: "privacy_policy_text",
      details: "Privacy Policy caricata da file .txt",
    });
    return sendSuccess(res, { value: content, setting }, "Privacy Policy caricata con successo");
  } catch (_error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return sendError(res, 500, "Errore caricamento Privacy Policy");
  }
});

router.get("/bg-location", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("bg_location_settings");
    return res.json(setting?.valueJson || setting?.value || {});
  } catch (_error) {
    return sendError(res, 500, "Errore lettura bg-location settings");
  }
});

router.patch("/bg-location", async (req: Request, res: Response) => {
  try {
    const current = await storage.getAppSetting("bg_location_settings");
    const existing = (current?.valueJson as Record<string, unknown>) || {};
    const updated = { ...existing, ...req.body };
    await storage.upsertAppSetting("bg_location_settings", undefined, updated);
    return res.json(updated);
  } catch (_error) {
    return sendError(res, 500, "Errore salvataggio bg-location settings");
  }
});

router.get("/floating-widget", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("floating_widget_settings");
    return res.json(setting?.value || {});
  } catch (_error) {
    return sendError(res, 500, "Errore lettura floating-widget settings");
  }
});

router.get("/show-distance-counter", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("show_distance_counter");
    return res.json({ enabled: setting?.value === "true" || setting?.valueJson === true });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura distance counter status");
  }
});

router.get("/version-distribution", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT app_version, COUNT(*) FROM users GROUP BY app_version`);
    return res.json(rows.rows);
  } catch (_error) {
    return sendError(res, 500, "Errore lettura distribuzione versioni");
  }
});

router.get("/apk-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("apk_download_url");
    return res.json({ url: setting?.value || "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura APK URL");
  }
});

router.get("/apk-info", async (_req: Request, res: Response) => {
  try {
    const urlSetting = await storage.getAppSetting("apk_download_url");
    const metaSetting = await storage.getAppSetting("apk_upload_meta");
    const url = urlSetting?.value || "";
    const meta = (metaSetting?.valueJson as { size?: number; uploadedAt?: string } | null) || null;
    return res.json({ url, size: meta?.size ?? null, uploadedAt: meta?.uploadedAt ?? null });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura info APK");
  }
});

router.post("/apk-upload", apkUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return sendError(res, 400, "Nessun file caricato");
    const originalName = req.file.originalname || "";
    if (!originalName.toLowerCase().endsWith(".apk")) {
      return sendError(res, 400, "Il file deve avere estensione .apk");
    }
    const { uploadBuffer, getPublicUrl } = await import("../../objectStorage");
    const objectPath = "public/releases/bikerlink-latest.apk";
    await uploadBuffer(objectPath, req.file.buffer, "application/vnd.android.package-archive");
    const url = await getPublicUrl(objectPath);
    const uploadedAt = new Date().toISOString();
    const size = req.file.size;
    await storage.upsertAppSetting("apk_download_url", url);
    await storage.upsertAppSetting("apk_upload_meta", undefined, { size, uploadedAt });
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "upload_apk",
      targetType: "app_setting",
      targetId: "apk_download_url",
      details: `APK caricato: ${originalName} (${(size / 1024 / 1024).toFixed(1)} MB)`,
    });
    return res.json({ url, size, uploadedAt });
  } catch (_error) {
    console.error("[admin] APK upload error:", _error);
    return sendError(res, 500, "Errore caricamento APK");
  }
});

router.get("/tc-terminal-apk-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("tc_terminal_apk_url");
    return res.json({ url: setting?.value || "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura TC Terminal APK URL");
  }
});

router.get("/play-store-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("play_store_url");
    return res.json({ url: setting?.value || "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura Play Store URL");
  }
});

router.get("/app-store-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("app_store_url");
    return res.json({ url: setting?.value || "" });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura App Store URL");
  }
});

export default router;
