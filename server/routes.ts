import type { Express } from "express";
import { createServer, type Server } from "node:http";
import path from "node:path";
import fs from "node:fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import { pool } from "./db";
import { storage } from "./storage";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import motorcycleRoutes from "./routes/motorcycles";
import proposalRoutes from "./routes/proposals";
import trackingRoutes from "./routes/tracking";
import wishlistRoutes from "./routes/wishlist";
import feedbackRoutes from "./routes/feedback";
import invitationRoutes from "./routes/invitations";
import contestRoutes from "./routes/contest";
import adsRoutes from "./routes/ads";
import chatRoutes from "./routes/chat";
import notificationRoutes from "./routes/notifications";
import reportRoutes from "./routes/reports";
import workshopRoutes from "./routes/workshops";
import easterEggRoutes from "./routes/easter-eggs";
import adminRoutes from "./routes/admin";
import moderatorRoutes from "./routes/moderator";
import customRoutesRouter from "./routes/custom-routes";
import sosRoutes from "./routes/sos";
import motoclubsRoutes from "./routes/motoclubs";

export async function registerRoutes(app: Express): Promise<Server> {
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(async (req: any, _res: any, next: any) => {
    if (req.session?.userId) {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user && user.lastLoginAt) {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (new Date(user.lastLoginAt) < fiveMinAgo) {
            await storage.updateUser(req.session.userId, { lastLoginAt: new Date() } as any);
          }
        }
      } catch {}
    }
    next();
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/motorcycles", motorcycleRoutes);
  app.use("/api/proposals", proposalRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/workshops", workshopRoutes);
  app.use("/api/easter-eggs", easterEggRoutes);
  app.use("/api/ads", adsRoutes);
  app.use("/api/contest", contestRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/invitations", invitationRoutes);
  app.use("/api/routes", trackingRoutes);
  app.use(customRoutesRouter);
  app.use("/api/admin", adminRoutes);
  app.use("/api/moderator", moderatorRoutes);
  app.use("/api/sos", sosRoutes);
  app.use("/api/motoclubs", motoclubsRoutes);

  app.get("/api/settings/privacy-policy", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("privacy_policy_text");
      const text = setting?.value || "";
      res.json({ text });
    } catch {
      res.json({ text: "" });
    }
  });

  app.get("/api/settings/email-verification", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("email_verification_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/ads-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("ads_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("syneco_branding_visible");
      const visible = setting?.value === "true";
      res.json({ visible });
    } catch {
      res.json({ visible: false });
    }
  });

  app.get("/api/settings/chatbot-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("chatbot_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/fake-users-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("fake_users_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/sos-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("sos_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/custom-routes", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("custom_routes_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/auto-matching", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("auto_matching_enabled");
      const enabled = setting?.value !== "false";
      res.json({ enabled });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/primal-user", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("primal_user_enabled");
      const enabled = setting?.value === "true";
      res.json({ enabled });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get("/api/settings/paypal", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("paypal_email");
      const email = setting?.value || "";
      res.json({ email });
    } catch {
      res.json({ email: "" });
    }
  });

  app.get("/api/settings/marketplace-enabled", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("marketplace_enabled");
      res.json({ enabled: setting?.value !== "false" });
    } catch {
      res.json({ enabled: true });
    }
  });

  app.get("/api/settings/gps-required", async (_req, res) => {
    try {
      const setting = await storage.getAppSetting("gps_required");
      res.json({ required: setting?.value !== "false" });
    } catch {
      res.json({ required: true });
    }
  });

  app.get("/api/settings/home-message", async (_req, res) => {
    try {
      const [enabledSetting, textSetting] = await Promise.all([
        storage.getAppSetting("home_message_enabled"),
        storage.getAppSetting("home_message_text"),
      ]);
      res.json({
        enabled: enabledSetting?.value === "true",
        text: textSetting?.value || "",
      });
    } catch {
      res.json({ enabled: false, text: "" });
    }
  });

  app.get("/api/settings/donation", async (_req, res) => {
    try {
      const [enabledSetting, textSetting, paypalSetting] = await Promise.all([
        storage.getAppSetting("donation_enabled"),
        storage.getAppSetting("donation_text"),
        storage.getAppSetting("paypal_email"),
      ]);
      res.json({
        enabled: enabledSetting?.value !== "false",
        text: textSetting?.value || "",
        paypalEmail: paypalSetting?.value || "",
      });
    } catch {
      res.json({ enabled: true, text: "", paypalEmail: "" });
    }
  });

  app.get("/api/settings/all", async (_req, res) => {
    try {
      const [syneco, emailVerification, chatbot, autoMatching, customRoutes, paypal, sosEnabled] = await Promise.all([
        storage.getAppSetting("syneco_branding_visible"),
        storage.getAppSetting("email_verification_enabled"),
        storage.getAppSetting("chatbot_enabled"),
        storage.getAppSetting("auto_matching_enabled"),
        storage.getAppSetting("custom_routes_enabled"),
        storage.getAppSetting("paypal_email"),
        storage.getAppSetting("sos_enabled"),
      ]);
      res.json({
        synecoBranding: syneco?.value === "true",
        emailVerification: emailVerification?.value === "true",
        chatbotEnabled: chatbot?.value !== "false",
        autoMatching: autoMatching?.value !== "false",
        customRoutes: customRoutes?.value !== "false",
        paypalEmail: paypal?.value || "",
        sosEnabled: sosEnabled?.value !== "false",
      });
    } catch {
      res.json({
        synecoBranding: false,
        emailVerification: false,
        chatbotEnabled: true,
        autoMatching: true,
        customRoutes: true,
        paypalEmail: "",
        sosEnabled: true,
      });
    }
  });

  const MANUAL_PATH = path.resolve(process.cwd(), "server/public/bikerlink-manual.pdf");
  const MANUAL_DIR = path.dirname(MANUAL_PATH);
  const EULA_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-eula.pdf");
  const PRIVACY_PDF_PATH = path.resolve(process.cwd(), "server/public/bikerlink-privacy-policy.pdf");

  app.get("/api/manual/download", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.status(404).json({ message: "Manuale non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-Manual.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(MANUAL_PATH);
    stream.on("error", (err) => {
      console.error("Manual stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Errore lettura file" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  app.get("/api/manual/info", (_req, res) => {
    if (!fs.existsSync(MANUAL_PATH)) {
      return res.json({ available: false });
    }
    const stats = fs.statSync(MANUAL_PATH);
    res.json({
      available: true,
      fileName: "BikerLink-Manual.pdf",
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
    });
  });

  const manualUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-manual.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.post("/api/admin/manual/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    manualUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(MANUAL_PATH);
      res.json({
        message: "Manuale aggiornato con successo",
        fileName: "BikerLink-Manual.pdf",
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    });
  });

  const eulaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-eula.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  const privacyUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!fs.existsSync(MANUAL_DIR)) fs.mkdirSync(MANUAL_DIR, { recursive: true });
        cb(null, MANUAL_DIR);
      },
      filename: (_req, _file, cb) => cb(null, "bikerlink-privacy-policy.pdf"),
    }),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") cb(null, true);
      else cb(new Error("Solo file PDF consentiti"));
    },
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  app.get("/api/eula/download", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) {
      return res.status(404).json({ message: "EULA non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-EULA.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(EULA_PDF_PATH);
    stream.on("error", (err) => {
      console.error("EULA stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/eula/info", (_req, res) => {
    if (!fs.existsSync(EULA_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(EULA_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/eula/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    eulaUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(EULA_PDF_PATH);
      res.json({ message: "EULA aggiornato con successo", fileName: "BikerLink-EULA.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/privacy-policy/download", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) {
      return res.status(404).json({ message: "Privacy Policy non disponibile" });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="BikerLink-PrivacyPolicy.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(PRIVACY_PDF_PATH);
    stream.on("error", (err) => {
      console.error("Privacy Policy stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Errore lettura file" });
      else res.end();
    });
    stream.pipe(res);
  });

  app.get("/api/privacy-policy/info", (_req, res) => {
    if (!fs.existsSync(PRIVACY_PDF_PATH)) return res.json({ available: false });
    const stats = fs.statSync(PRIVACY_PDF_PATH);
    res.json({ available: true, fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
  });

  app.post("/api/admin/privacy-policy/upload", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Accesso non autorizzato" });

    privacyUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ message: err.message || "Errore upload" });
      if (!req.file) return res.status(400).json({ message: "Nessun file caricato" });
      const stats = fs.statSync(PRIVACY_PDF_PATH);
      res.json({ message: "Privacy Policy aggiornata con successo", fileName: "BikerLink-PrivacyPolicy.pdf", fileSize: stats.size, lastModified: stats.mtime.toISOString() });
    });
  });

  app.get("/api/user/export-data", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Non autenticato" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        sex: user.sex ?? null,
        birthYear: user.birthYear ?? null,
        country: user.country ?? null,
        region: user.region ?? null,
        role: user.role,
        status: user.status,
        createdAt: null,
      },
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `BikerLink-UserData-${user.nickname}-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(json);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const httpServer = createServer(app);

  import("./backup-service").then(({ startScheduler }) => {
    startScheduler().catch((err) => {
      console.error("[backup-service] Failed to start scheduler:", err);
    });
  }).catch(() => {});

  return httpServer;
}
