import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { appSettings, emailConfigSchema, disableFeatureSchema, toggleProtectedSchema, booleanSettingValueSchema, stringSettingValueSchema, mapsProviderSchema, themeDefaultSchema, matchingCountriesSchema, coordinatesMaxAgeSchema, genericSettingSchema, maintenanceSettingsSchema, bgLocationSettingsSchema, coordinateHistorySettingsSchema, nativeVersionSchema, urlSettingSchema } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { bustLandingImagesCache } from "../../site/routes";

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

router.get("/", async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Admin get settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/email-config", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("email_config");
    return res.json(setting?.value || {});
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura config email" });
  }
});

router.put("/email-config", async (req: Request, res: Response) => {
  try {
    const parsedEc = emailConfigSchema.safeParse(req.body);
    if (!parsedEc.success) return res.status(400).json({ message: parsedEc.error.issues[0].message });
    const setting = await storage.upsertAppSetting("email_config", parsedEc.data);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio config email" });
  }
});

router.put("/disable-feature", async (req: Request, res: Response) => {
  try {
    const parsedDf = disableFeatureSchema.safeParse(req.body);
    if (!parsedDf.success) return res.status(400).json({ message: parsedDf.error.issues[0].message });
    const { key, disabled } = parsedDf.data;
    const setting = await storage.upsertAppSetting(`disable_${key}`, disabled);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore disabilitazione feature" });
  }
});

router.put("/toggle-protected", async (req: Request, res: Response) => {
  try {
    const parsedTp = toggleProtectedSchema.safeParse(req.body);
    if (!parsedTp.success) return res.status(400).json({ message: parsedTp.error.issues[0].message });
    const { email, protected: isProt } = parsedTp.data;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore toggle protetto" });
  }
});

router.put("/motoclub_include_zav", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("motoclub_include_zav", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/show_search_preference", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("show_search_preference", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/match_preferences_visible", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("match_preferences_visible", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/search_preference_locked", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("search_preference_locked", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/maps_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("maps_enabled", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/primal_user_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("primal_user_enabled", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/maps_provider", async (req: Request, res: Response) => {
  try {
    const parsed = mapsProviderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("maps_provider", parsed.data.provider);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio provider mappe" });
  }
});

router.put("/theme_user_switching_enabled", async (req: Request, res: Response) => {
  try {
    const val = req.body.value === true || req.body.value === "true";
    const setting = await storage.upsertAppSetting("theme_user_switching_enabled", val);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.put("/theme_default", async (req: Request, res: Response) => {
  try {
    const parsed = themeDefaultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("theme_default", parsed.data.theme);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio tema" });
  }
});

router.get("/matching_countries", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("matching_countries");
    return res.json(setting?.value || []);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura paesi" });
  }
});

router.put("/matching_countries", async (req: Request, res: Response) => {
  try {
    const parsed = matchingCountriesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("matching_countries", parsed.data.countries);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio paesi" });
  }
});

router.get("/coordinates_max_age_seconds", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("coordinates_max_age_seconds");
    return res.json({ value: setting?.value || 3600 });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura max age" });
  }
});

router.put("/coordinates_max_age_seconds", async (req: Request, res: Response) => {
  try {
    const parsed = coordinatesMaxAgeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("coordinates_max_age_seconds", parsed.data.seconds);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio max age" });
  }
});

router.put("/:key", async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const parsed = genericSettingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting(key, parsed.data.value);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio setting" });
  }
});

router.post("/eula/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
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
    return res.json({ message: "EULA caricato con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ message: "Errore caricamento EULA" });
  }
});

router.post("/privacy-policy/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
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
    return res.json({ message: "Privacy Policy caricata con successo", value: content, setting });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ message: "Errore caricamento Privacy Policy" });
  }
});

router.get("/bg-location", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("bg_location_settings");
    return res.json(setting?.value || {});
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura bg-location settings" });
  }
});

router.get("/floating-widget", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("floating_widget_settings");
    return res.json(setting?.value || {});
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura floating-widget settings" });
  }
});

router.get("/show-distance-counter", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("show_distance_counter");
    return res.json({ enabled: setting?.value === true });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura distance counter status" });
  }
});

router.get("/version-distribution", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT app_version, COUNT(*) FROM users GROUP BY app_version`);
    return res.json(rows.rows);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura distribuzione versioni" });
  }
});

router.put("/native-version", async (req: Request, res: Response) => {
  try {
    const parsed = nativeVersionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("native_version", parsed.data);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio native version" });
  }
});

router.get("/apk-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("apk_url");
    return res.json({ url: setting?.value || "" });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura APK URL" });
  }
});

router.put("/apk-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("apk_url", parsed.data.url);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio APK URL" });
  }
});

router.get("/play-store-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("play_store_url");
    return res.json({ url: setting?.value || "" });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura Play Store URL" });
  }
});

router.put("/play-store-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("play_store_url", parsed.data.url);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio Play Store URL" });
  }
});

router.get("/website-url", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("website_url");
    return res.json({ url: setting?.value || "" });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura Website URL" });
  }
});

router.put("/website-url", async (req: Request, res: Response) => {
  try {
    const parsed = urlSettingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("website_url", parsed.data.url);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio Website URL" });
  }
});

router.get("/maintenance", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("maintenance_settings");
    return res.json(setting?.value || { enabled: false, message: "" });
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura maintenance mode" });
  }
});

router.put("/maintenance", async (req: Request, res: Response) => {
  try {
    const parsed = maintenanceSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const setting = await storage.upsertAppSetting("maintenance_settings", parsed.data);
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio maintenance mode" });
  }
});

router.get("/landing-images", async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("landing_images");
    return res.json(setting?.value || []);
  } catch (error) {
    return res.status(500).json({ message: "Errore lettura landing images" });
  }
});

router.post("/landing-images", async (req: Request, res: Response) => {
  try {
    const images = req.body.images;
    if (!Array.isArray(images)) return res.status(400).json({ message: "Images deve essere un array" });
    const setting = await storage.upsertAppSetting("landing_images", images);
    await bustLandingImagesCache();
    return res.json(setting);
  } catch (error) {
    return res.status(500).json({ message: "Errore salvataggio landing images" });
  }
});

export default router;
