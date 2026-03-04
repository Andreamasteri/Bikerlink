import type { Express } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import path from "path";
import express from "express";

import { authRouter } from "./routes/auth";
import { uploadRouter } from "./routes/upload";
import { usersRouter } from "./routes/users";
import { proposalsRouter } from "./routes/proposals";
import { chatRouter } from "./routes/chat";
import { trackingRouter } from "./routes/tracking";
import { contestRouter } from "./routes/contest";
import { workshopsRouter } from "./routes/workshops";
import { easterEggsRouter } from "./routes/easter-eggs";
import { adminRouter } from "./routes/admin";
import { moderatorRouter } from "./routes/moderator";
import { reportsRouter } from "./routes/reports";
import { notificationsRouter } from "./routes/notifications";
import { adsRouter } from "./routes/ads";
import { feedbackRouter } from "./routes/feedback";
import { garageRouter } from "./routes/garage";
import { proximityRouter } from "./routes/proximity";
import { setupWebSocket } from "./websocket";
import { storage } from "./storage";
import { uploadRateLimit, messageRateLimit } from "./middleware/security";

const PgStore = connectPgSimple(session);

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      store: new PgStore({
        pool: pool as any,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "bikerlink-secret-dev",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use("/api/auth", authRouter);
  app.use("/api/upload", uploadRateLimit, uploadRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/proposals", proposalsRouter);
  app.use("/api/conversations", messageRateLimit, chatRouter);
  app.use("/api/routes", trackingRouter);
  app.use("/api/contest", contestRouter);
  app.use("/api/workshops", workshopsRouter);
  app.use("/api/easter-eggs", easterEggsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/moderator", moderatorRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/ads", adsRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/garage", garageRouter);
  app.use("/api/proximity", proximityRouter);

  app.get("/api/settings/paypal_donation_address", async (_req, res) => {
    try {
      const val = await storage.getSetting("paypal_donation_address");
      res.json({ address: val || "" });
    } catch {
      res.json({ address: "" });
    }
  });

  app.get("/api/settings/syneco-branding", async (_req, res) => {
    try {
      const val = await storage.getSetting("syneco_branding_visible");
      res.json({ visible: val === "true" });
    } catch {
      res.json({ visible: false });
    }
  });

  await seedAdminAndDefaults();

  const httpServer = createServer(app);
  setupWebSocket(httpServer);

  return httpServer;
}

async function seedAdminAndDefaults() {
  try {
    const adminPassword = "admin2025!";
    const admin = await storage.getUserByEmail("admin@bikerlink.it");
    if (!admin) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await storage.createUser({
        email: "admin@bikerlink.it",
        nickname: "admin",
        passwordHash,
        sex: "male",
        birthYear: 1990,
        region: "Lombardia",
        userType: "biker",
        eulaAccepted: true,
      });

      const newAdmin = await storage.getUserByEmail("admin@bikerlink.it");
      if (newAdmin) {
        await storage.updateUser(newAdmin.id, { role: "admin" });
      }

      console.log("[SEED] Admin creato: admin@bikerlink.it / admin2025!");
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const updates: any = { passwordHash };
      if (admin.nickname !== "admin") {
        updates.nickname = "admin";
      }
      await storage.updateUser(admin.id, updates);
      console.log("[SEED] Admin password aggiornata: admin@bikerlink.it / admin2025!");
    }

    await storage.seedDefaultSettings();
    console.log("[SEED] Impostazioni predefinite caricate");
  } catch (err) {
    console.error("[SEED] Errore nel seeding:", err);
  }
}
