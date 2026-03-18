import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { db } from "../db";
import { motoClubs, motoClubRequests, motoClubMembers, conversations, moderatorLogs, users, userProfiles } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const router = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  storage.getUser(req.session.userId).then((user) => {
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }
    (req as any).currentUser = user;
    next();
  }).catch(() => {
    return res.status(500).json({ message: "Errore autenticazione admin" });
  });
}

router.use(requireAdmin);

router.post("/verify-password", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password mancante" });
    }
    const user = (req as any).currentUser;
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !fullUser.password) {
      return res.status(403).json({ message: "Utente non trovato" });
    }
    const valid = await bcrypt.compare(password, fullUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Password non corretta" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Errore verifica password" });
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await storage.getAllUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    return res.json(safeUsers);
  } catch (error) {
    console.error("Admin get users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!["active", "suspended", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const user = await storage.updateUser(id, { status });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_status_${status}`,
      targetType: "user",
      targetId: id,
      details: `Status cambiato a ${status}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/role", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }
    const user = await storage.updateUser(id, { role });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_role_${role}`,
      targetType: "user",
      targetId: id,
      details: `Ruolo cambiato a ${role}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user role error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/email", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Email non valida" });
    }
    const user = await storage.updateUser(id, { email });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_email",
      targetType: "user",
      targetId: id,
      details: `Email aggiornata a ${email}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user email error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/password", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "La password deve avere almeno 6 caratteri" });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await storage.updateUser(id, { password: hashedPassword });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "reset_password",
      targetType: "user",
      targetId: id,
      details: "Password resettata dall'admin",
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin update user password error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/users/:id/primal", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { isPrimal } = req.body;
    const user = await storage.updateUser(id, { isPrimal: !!isPrimal });
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: isPrimal ? "assign_primal" : "remove_primal",
      targetType: "user",
      targetId: id,
      details: `Primal ${isPrimal ? "assegnato" : "rimosso"} a ${user.nickname}`,
    });
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error("Admin toggle primal error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "Utente non trovato" });
    }
    if (user.role === "admin" || user.role === "moderator") {
      return res.status(403).json({ message: "Impossibile eliminare un utente di sistema" });
    }
    await storage.deleteUser(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_user",
      targetType: "user",
      targetId: id,
      details: `Utente eliminato: ${user.nickname}`,
    });
    return res.json({ message: "Utente eliminato con successo" });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/workshops", async (_req: Request, res: Response) => {
  try {
    const workshopsList = await storage.getWorkshops();
    return res.json(workshopsList);
  } catch (error) {
    console.error("Admin get workshops error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/workshops", async (req: Request, res: Response) => {
  try {
    const workshop = await storage.createWorkshop(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_workshop",
      targetType: "workshop",
      targetId: workshop.id,
      details: `Officina creata: ${workshop.name}`,
    });
    return res.status(201).json(workshop);
  } catch (error) {
    console.error("Admin create workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/workshops/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const workshop = await storage.updateWorkshop(id, req.body);
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina aggiornata: ${workshop.name}`,
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin update workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/workshops/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const workshop = await storage.updateWorkshop(id, { isApproved: true });
    if (!workshop) {
      return res.status(404).json({ message: "Officina non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "approve_workshop",
      targetType: "workshop",
      targetId: id,
      details: `Officina approvata: ${workshop.name}`,
    });
    return res.json(workshop);
  } catch (error) {
    console.error("Admin approve workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/workshops/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteWorkshop(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_workshop",
      targetType: "workshop",
      targetId: id,
    });
    return res.json({ message: "Officina eliminata" });
  } catch (error) {
    console.error("Admin delete workshop error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs", async (_req: Request, res: Response) => {
  try {
    const eggs = await storage.getEasterEggs();
    return res.json(eggs);
  } catch (error) {
    console.error("Admin get easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/easter-eggs", async (req: Request, res: Response) => {
  try {
    const egg = await storage.createEasterEgg(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_easter_egg",
      targetType: "easter_egg",
      targetId: egg.id,
      details: `Easter egg creato: ${egg.name}`,
    });
    return res.status(201).json(egg);
  } catch (error) {
    console.error("Admin create easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/easter-eggs/batch", async (req: Request, res: Response) => {
  try {
    const count = parseInt(req.body.count) || 10;
    const radius = parseInt(req.body.radius) || 30;
    const points = parseInt(req.body.points) || 10;
    const existing = await storage.getEasterEggs();
    const startNum = existing.length + 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      const lat = 36 + Math.random() * 11;
      const lng = 6.5 + Math.random() * 12;
      const egg = await storage.createEasterEgg({
        name: `Easter Egg #${startNum + i}`,
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
        radius,
        points,
        isActive: true,
      });
      created.push(egg);
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "batch_create_easter_eggs",
      targetType: "easter_egg",
      targetId: "",
      details: `${count} Easter Egg creati in batch`,
    });
    return res.status(201).json(created);
  } catch (error) {
    console.error("Admin batch create easter eggs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/easter-eggs/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const egg = await storage.updateEasterEgg(id, req.body);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_easter_egg",
      targetType: "easter_egg",
      targetId: id,
      details: `Easter egg aggiornato: ${egg.name}`,
    });
    return res.json(egg);
  } catch (error) {
    console.error("Admin update easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/easter-eggs/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteEasterEgg(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_easter_egg",
      targetType: "easter_egg",
      targetId: id,
    });
    return res.json({ message: "Easter egg eliminato" });
  } catch (error) {
    console.error("Admin delete easter egg error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs/:id/stats", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const egg = await storage.getEasterEgg(id);
    if (!egg) {
      return res.status(404).json({ message: "Easter egg non trovato" });
    }
    const { db } = await import("../db");
    const { collectedEasterEggs } = await import("../../shared/schema");
    const { eq, count } = await import("drizzle-orm");
    const [result] = await db.select({ count: count() }).from(collectedEasterEggs).where(eq(collectedEasterEggs.easterEggId, id));
    return res.json({ eggId: id, collectionsCount: result?.count || 0 });
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/easter-eggs-stats", async (_req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { collectedEasterEggs } = await import("../../shared/schema");
    const { count, sql } = await import("drizzle-orm");
    const rows = await db.select({
      easterEggId: collectedEasterEggs.easterEggId,
      collectionsCount: count(),
    }).from(collectedEasterEggs).groupBy(collectedEasterEggs.easterEggId);
    const statsMap: Record<string, number> = {};
    rows.forEach((r) => { statsMap[r.easterEggId] = Number(r.collectionsCount); });
    return res.json(statsMap);
  } catch (error) {
    console.error("Admin get easter egg stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get campaigns error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/campaigns", async (req: Request, res: Response) => {
  try {
    const campaign = await storage.createAdCampaign(req.body);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_campaign",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Campagna creata: ${campaign.name}`,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const campaign = await storage.updateAdCampaign(id, req.body);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_campaign",
      targetType: "campaign",
      targetId: id,
      details: `Campagna aggiornata: ${campaign.name}`,
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_campaign",
      targetType: "campaign",
      targetId: id,
    });
    return res.json({ message: "Campagna eliminata" });
  } catch (error) {
    console.error("Admin delete campaign error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/reports", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const reportsList = await storage.getReports(status);
    return res.json(reportsList);
  } catch (error) {
    console.error("Admin get reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/reports/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!["resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Stato non valido" });
    }
    const report = await storage.updateReport(id, {
      status,
      resolvedBy: req.session.userId!,
      resolvedAt: new Date(),
    });
    if (!report) {
      return res.status(404).json({ message: "Segnalazione non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `resolve_report_${status}`,
      targetType: "report",
      targetId: id,
      details: `Segnalazione ${status}`,
    });
    return res.json(report);
  } catch (error) {
    console.error("Admin resolve report error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { pool } = await import("../db");
    const totalUsersResult = await pool.query("SELECT count(*)::int as count FROM users WHERE is_fake = false");
    const totalUsers = totalUsersResult.rows[0]?.count ?? 0;

    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const [onlineUsersNow, activeUsersWeek, workshopContacts, campaigns, pendingReports] = await Promise.all([
      storage.countActiveUsers(fifteenMinutesAgo),
      storage.countActiveUsers(sevenDaysAgo),
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
      storage.getReports("pending"),
    ]);

    const totalAdClicks = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);

    return res.json({
      totalUsers,
      onlineUsersNow,
      activeUsersWeek,
      workshopContactsMonth: workshopContacts.length,
      totalAdClicks,
      activeCampaigns: campaigns.filter((c) => c.isActive).length,
      pendingReports: pendingReports.length,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/export-csv", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [workshopContacts, campaigns] = await Promise.all([
      storage.getWorkshopContactsByPeriod(thirtyDaysAgo, now),
      storage.getAllCampaigns(),
    ]);

    let csv = "Tipo,ID,Nome,Contatti/Click,Impressioni,Periodo\n";

    for (const campaign of campaigns) {
      csv += `Campagna,${campaign.id},"${campaign.name}",${campaign.impressions},${campaign.impressions},Ultimo mese\n`;
    }

    const contactsByWorkshop: Record<string, number> = {};
    for (const contact of workshopContacts) {
      contactsByWorkshop[contact.workshopId] = (contactsByWorkshop[contact.workshopId] || 0) + 1;
    }

    for (const [workshopId, count] of Object.entries(contactsByWorkshop)) {
      csv += `Officina,${workshopId},,${count},,Ultimo mese\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=syneco-report.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Admin export CSV error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/users-list", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", sex, region, created_at as \"createdAt\" FROM users WHERE is_fake = false ORDER BY created_at DESC"
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics users-list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/active-users", async (req: Request, res: Response) => {
  try {
    const period = parseInt(req.query.period as string) || 30;
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", last_login_at as \"lastLoginAt\" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC",
      [since]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics active-users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/online-now", async (_req: Request, res: Response) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const { pool } = await import("../db");
    const result = await pool.query(
      "SELECT id, nickname, user_type as \"userType\", last_login_at as \"lastLoginAt\" FROM users WHERE is_fake = false AND status = 'active' AND last_login_at >= $1 ORDER BY last_login_at DESC",
      [fifteenMinutesAgo]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics online-now error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/ad-clicks", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      `SELECT ac.id, ac.user_id as "userId", u.nickname, u.user_type as "userType", 
              camp.name as "adTitle", ac.created_at as "clickedAt"
       FROM ad_clicks ac
       LEFT JOIN users u ON ac.user_id = u.id
       LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
       ORDER BY ac.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics ad-clicks error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/analytics/pending-reports", async (_req: Request, res: Response) => {
  try {
    const { pool } = await import("../db");
    const result = await pool.query(
      `SELECT ft.id, ft.ticket_type as "type", ft.subject as "title", ft.message as "description",
              u.nickname as "submittedBy", ft.created_at as "createdAt"
       FROM feedback_tickets ft
       LEFT JOIN users u ON ft.user_id = u.id
       WHERE ft.status = 'open'
       ORDER BY ft.created_at DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Admin analytics pending-reports error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getAllAppSettings();
    return res.json(settings);
  } catch (error) {
    console.error("Admin get settings error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/settings/email-config", async (_req: Request, res: Response) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const gmailUser = userSetting?.value || "";
    let masked = "";
    if (gmailUser) {
      const [local, domain] = gmailUser.split("@");
      if (local && domain) {
        masked = local.substring(0, 3) + "***@" + domain;
      } else {
        masked = gmailUser.substring(0, 3) + "***";
      }
    }
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const configured = !!(gmailUser && passSetting?.value);
    return res.json({ configured, maskedEmail: masked });
  } catch (error) {
    console.error("Get email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/email-config", async (req: Request, res: Response) => {
  try {
    const { gmailUser, gmailAppPassword, adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }

    const admin = (req as any).currentUser;
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non corretta" });
    }

    if (gmailUser) {
      await storage.upsertAppSetting("gmail_user", gmailUser);
    }
    if (gmailAppPassword) {
      await storage.upsertAppSetting("gmail_app_password", gmailAppPassword);
    }

    return res.json({ message: "Configurazione email aggiornata" });
  } catch (error) {
    console.error("Update email config error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/migrate/verify-real-users", async (_req: Request, res: Response) => {
  try {
    const allUsers = await storage.getAllUsers();
    const realUsers = allUsers.filter((u: any) => !u.isFake && !u.emailVerified);
    for (const user of realUsers) {
      await storage.markUserEmailVerified(user.id);
    }
    return res.json({ message: `${realUsers.length} utenti reali marcati come verificati` });
  } catch (error) {
    console.error("Migrate verify real users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/toggle-protected", async (req: Request, res: Response) => {
  try {
    const { key, value, adminPassword } = req.body;
    const allowedKeys = ["email_verification_enabled", "ads_enabled", "syneco_branding_visible", "donation_enabled", "donation_text", "gps_required", "marketplace_enabled", "fake_users_enabled"];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ message: "Chiave non valida" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }

    const admin = await storage.getUser(req.session.userId!);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }

    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }

    const result = await storage.upsertAppSetting(key, value);
    await storage.createModeratorLog({
      moderatorId: admin.id,
      action: "update_setting",
      targetType: "setting",
      targetId: key,
      details: `${key} = ${value}`,
    } as any);

    return res.json(result);
  } catch (error) {
    console.error("Admin toggle-protected error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/settings/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { value, valueJson } = req.body;
    const setting = await storage.upsertAppSetting(key, value, valueJson);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_setting",
      targetType: "app_setting",
      targetId: key,
      details: `Impostazione aggiornata: ${key}`,
    });
    return res.json(setting);
  } catch (error) {
    console.error("Admin update setting error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

const adsDir = path.join(process.cwd(), "uploads", "ads");
if (!fs.existsSync(adsDir)) {
  fs.mkdirSync(adsDir, { recursive: true });
}

const adImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, adsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const adUpload = multer({
  storage: adImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG, PNG, WebP o GIF"));
    }
  },
});

router.get("/advertisements", async (_req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllCampaigns();
    return res.json(campaigns);
  } catch (error) {
    console.error("Admin get advertisements error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/advertisements", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const { name, sponsor, linkUrl, description, targetUserType, rotationDuration, rotationMode, sortOrder, startDate, endDate, placement } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Nome campagna obbligatorio" });
    }
    const imageUrl = req.file ? `/uploads/ads/${req.file.filename}` : (req.body.imageUrl || null);
    const campaign = await storage.createAdCampaign({
      name,
      sponsor: sponsor || "Syneco Lubrificanti",
      imageUrl,
      linkUrl: linkUrl || null,
      displayMode: "banner",
      description: description || null,
      targetUserType: targetUserType || "biker",
      rotationDuration: rotationDuration ? parseInt(rotationDuration) : 10,
      rotationMode: rotationMode || "sequential",
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      placement: placement || "all",
    });
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_advertisement",
      targetType: "campaign",
      targetId: campaign.id,
      details: `Pubblicità creata: ${campaign.name} (${targetUserType || "biker"})`,
    });
    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Admin create advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/advertisements/:id", adUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const updates: any = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.sponsor !== undefined) updates.sponsor = req.body.sponsor;
    if (req.body.linkUrl !== undefined) updates.linkUrl = req.body.linkUrl;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive === true || req.body.isActive === "true";
    if (req.body.targetUserType !== undefined) updates.targetUserType = req.body.targetUserType;
    if (req.body.rotationDuration !== undefined) updates.rotationDuration = parseInt(req.body.rotationDuration);
    if (req.body.rotationMode !== undefined) updates.rotationMode = req.body.rotationMode;
    if (req.body.sortOrder !== undefined) updates.sortOrder = parseInt(req.body.sortOrder);
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (req.body.placement !== undefined) updates.placement = req.body.placement;
    if (req.file) updates.imageUrl = `/uploads/ads/${req.file.filename}`;
    else if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
    const campaign = await storage.updateAdCampaign(id, updates);
    if (!campaign) {
      return res.status(404).json({ message: "Campagna non trovata" });
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_advertisement",
      targetType: "campaign",
      targetId: id,
      details: `Pubblicità aggiornata: ${campaign.name}`,
    });
    return res.json(campaign);
  } catch (error) {
    console.error("Admin update advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/advertisements/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await storage.deleteCampaign(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_advertisement",
      targetType: "campaign",
      targetId: id,
    });
    return res.json({ message: "Pubblicità eliminata" });
  } catch (error) {
    console.error("Admin delete advertisement error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

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

router.post("/settings/eula/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }

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
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Admin upload EULA error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/settings/privacy-policy/upload", eulaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nessun file caricato" });
    }

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
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Admin upload Privacy Policy error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/performance-records", async (_req: Request, res: Response) => {
  try {
    const allRoutes = await storage.getAllRoutes();
    const userIds = [...new Set(allRoutes.map(r => r.userId))];
    const usersMap: Record<string, string> = {};
    for (const uid of userIds) {
      const user = await storage.getUser(uid);
      if (user) usersMap[uid] = user.nickname;
    }
    const records = allRoutes.map(r => ({
      ...r,
      nickname: usersMap[r.userId] || "Sconosciuto",
    }));
    return res.json(records);
  } catch (error) {
    console.error("Admin get performance records error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await storage.getModeratorLogs();
    return res.json(logs);
  } catch (error) {
    console.error("Admin get logs error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/fake-users", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const type = String(req.query.type ?? "tutti");
    const result = await storage.getFakeUserStats(limit, offset, type);
    return res.json(result);
  } catch (error) {
    console.error("Admin get fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/fake-users", async (req: Request, res: Response) => {
  try {
    const { nickname, userType, sex, coupleSexConfig, birthYear, region, bio, moto, wishlistDescription, wishlistMotos } = req.body;
    if (!nickname || !userType) {
      return res.status(400).json({ message: "Nickname e tipo utente obbligatori" });
    }
    const email = `fake_${nickname.toLowerCase().replace(/[^a-z0-9]/g, "")}@fakeuser.bikerlink.it`;
    const hashedPassword = await bcrypt.hash("fakeuser2025!", 10);
    const ITALIAN_REGIONS = new Set(["Abruzzo","Basilicata","Calabria","Campania","Emilia-Romagna","Friuli Venezia Giulia","Lazio","Liguria","Lombardia","Marche","Molise","Piemonte","Puglia","Sardegna","Sicilia","Toscana","Trentino-Alto Adige","Umbria","Valle d'Aosta","Veneto"]);
    const country = req.body.country || (region && ITALIAN_REGIONS.has(region) ? "IT" : "IT");
    const user = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      coupleSexConfig: coupleSexConfig || null,
      birthYear: birthYear || null,
      region: region || null,
      country,
      isFake: true,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
      lastLoginAt: new Date(),
    });
    const regionCoords: Record<string, { lat: number; lng: number }> = {
      "Abruzzo": { lat: 42.19, lng: 13.73 }, "Basilicata": { lat: 40.64, lng: 15.97 },
      "Calabria": { lat: 38.91, lng: 16.59 }, "Campania": { lat: 40.85, lng: 14.27 },
      "Emilia-Romagna": { lat: 44.49, lng: 11.34 }, "Friuli Venezia Giulia": { lat: 46.07, lng: 13.23 },
      "Lazio": { lat: 41.90, lng: 12.50 }, "Liguria": { lat: 44.41, lng: 8.95 },
      "Lombardia": { lat: 45.46, lng: 9.19 }, "Marche": { lat: 43.62, lng: 13.52 },
      "Molise": { lat: 41.56, lng: 14.67 }, "Piemonte": { lat: 45.07, lng: 7.69 },
      "Puglia": { lat: 41.13, lng: 16.86 }, "Sardegna": { lat: 39.22, lng: 9.12 },
      "Sicilia": { lat: 37.60, lng: 14.02 }, "Toscana": { lat: 43.77, lng: 11.25 },
      "Trentino-Alto Adige": { lat: 46.07, lng: 11.13 }, "Umbria": { lat: 43.00, lng: 12.64 },
      "Valle d'Aosta": { lat: 45.74, lng: 7.32 }, "Veneto": { lat: 45.44, lng: 12.33 },
    };
    const coords = region ? regionCoords[region] : null;
    const lat = coords ? coords.lat + (Math.random() - 0.5) * 0.5 : null;
    const lng = coords ? coords.lng + (Math.random() - 0.5) * 0.5 : null;
    await storage.createUserProfile({
      userId: user.id,
      isAvailable: true,
      latitude: lat,
      longitude: lng,
      bio: bio || null,
    });
    if (moto && (userType === "biker" || userType === "coppia")) {
      await storage.createUserMotorcycle({
        userId: user.id,
        brand: moto.brand || "Ducati",
        model: moto.model || "Monster",
        year: moto.year || 2022,
        displacement: moto.displacement || 821,
        motorcycleType: moto.motorcycleType || "Naked",
        ridingStyle: moto.ridingStyle || "Allegra",
      });
    }
    if (userType === "zavorrina" && wishlistDescription) {
      const wl = await storage.createOrUpdateWishlist(user.id, wishlistDescription);
      if (wishlistMotos && Array.isArray(wishlistMotos)) {
        for (const wm of wishlistMotos) {
          await storage.addWishlistMoto({
            wishlistId: wl.id,
            brand: wm.brand || null,
            model: wm.model || null,
            motorcycleType: wm.motorcycleType || null,
            ridingStyle: wm.ridingStyle || null,
          });
        }
      }
    }
    const { password: _, ...safeUser } = user;
    return res.status(201).json(safeUser);
  } catch (error) {
    console.error("Admin create fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/users/:id/stats", async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { pool } = await import("../db");

    const userResult = await pool.query(
      `SELECT u.id, u.nickname, u.email, u.user_type as "userType", u.role, u.status,
              u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              u.is_fake as "isFake", u.is_primal as "isPrimal",
              up.total_km as "totalKm", up.total_rides as "totalRides",
              up.is_available as "isAvailable", up.bio,
              up.latitude, up.longitude
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Utente non trovato" });
    }

    const user = userResult.rows[0];

    const [proposalsResult, conversationsResult, messagesResult, adClicksResult, reportsResult, motorcyclesResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as count FROM proposals WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as count FROM conversation_participants WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as count FROM messages WHERE sender_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT ac.id, camp.name as "adTitle", ac.created_at as "clickedAt"
         FROM ad_clicks ac
         LEFT JOIN ad_campaigns camp ON ac.campaign_id = camp.id
         WHERE ac.user_id = $1
         ORDER BY ac.created_at DESC
         LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as "filed", 
                (SELECT COUNT(*)::int FROM reports WHERE reported_user_id = $1) as "received"
         FROM reports WHERE reporter_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT brand, model, year, displacement, motorcycle_type as "motorcycleType", riding_style as "ridingStyle"
         FROM user_motorcycles WHERE user_id = $1`,
        [userId]
      ),
    ]);

    const loginHistory = await pool.query(
      `SELECT ml.action, ml.created_at as "createdAt", m.nickname as "moderatorNickname"
       FROM moderator_logs ml
       LEFT JOIN users m ON ml.moderator_id = m.id
       WHERE ml.target_id = $1
       ORDER BY ml.created_at DESC
       LIMIT 20`,
      [userId]
    );

    return res.json({
      user,
      stats: {
        proposalsCreated: proposalsResult.rows[0]?.count ?? 0,
        conversationsCount: conversationsResult.rows[0]?.count ?? 0,
        messagesSent: messagesResult.rows[0]?.count ?? 0,
        reportsFiled: reportsResult.rows[0]?.filed ?? 0,
        reportsReceived: reportsResult.rows[0]?.received ?? 0,
      },
      adClicks: adClicksResult.rows,
      motorcycles: motorcyclesResult.rows,
      moderatorLogs: loginHistory.rows,
    });
  } catch (error) {
    console.error("Admin user stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/fake-users/toggle-all", async (req: Request, res: Response) => {
  try {
    const { enabled, adminPassword } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "Il campo 'enabled' deve essere un booleano" });
    }
    if (!adminPassword) {
      return res.status(400).json({ message: "Password admin richiesta" });
    }
    const admin = await storage.getUser(req.session.userId!);
    if (!admin) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    const validPassword = await bcrypt.compare(adminPassword, admin.password);
    if (!validPassword) {
      return res.status(403).json({ message: "Password admin non valida" });
    }
    const { db } = await import("../db");
    const { users: usersTable, userProfiles } = await import("../../shared/schema");
    const { eq } = await import("drizzle-orm");
    await storage.upsertAppSetting("fake_users_enabled", enabled ? "true" : "false");
    const fakeUsers = await db.select().from(usersTable).where(eq(usersTable.isFake, true));
    const newLoginAt = enabled ? new Date() : new Date("2020-01-01");
    for (const fakeUser of fakeUsers) {
      await db.update(userProfiles).set({ isAvailable: enabled }).where(eq(userProfiles.userId, fakeUser.id));
      const userUpdate: Record<string, unknown> = { lastLoginAt: newLoginAt };
      if (enabled && !fakeUser.country) userUpdate.country = "IT";
      await db.update(usersTable).set(userUpdate as any).where(eq(usersTable.id, fakeUser.id));
    }
    return res.json({ message: `Tutti gli utenti fake sono stati ${enabled ? "abilitati" : "disabilitati"}`, count: fakeUsers.length });
  } catch (error) {
    console.error("Admin toggle all fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/fake-users", async (req: Request, res: Response) => {
  console.log("[Admin] DELETE /fake-users ricevuto");
  try {
    const count = await storage.deleteAllFakeUsers();
    await storage.upsertAppSetting("skip_fake_user_seed", "true");
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_all_fake_users",
      targetType: "user",
      targetId: "",
      details: `Eliminati tutti gli utenti fake (${count})`,
    });
    console.log(`[Admin] DELETE /fake-users completato: ${count} eliminati`);
    return res.json({ message: `${count} utenti fake eliminati`, count });
  } catch (error) {
    console.error("[Admin] DELETE /fake-users ERRORE:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/fake-users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    await storage.deleteFakeUser(id);
    return res.json({ message: "Utente finto eliminato" });
  } catch (error) {
    console.error("Admin delete fake user error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/fake-users/:id/toggle-available", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const profile = await storage.getUserProfile(id);
    if (!profile) {
      return res.status(404).json({ message: "Profilo non trovato" });
    }
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateUserProfile(id, {
      isAvailable: !profile.isAvailable,
      adminOverrideUntil: overrideUntil,
    } as any);
    return res.json({ isAvailable: !profile.isAvailable });
  } catch (error) {
    console.error("Admin toggle fake user availability error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/fake-users/:id/toggle-online", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const user = await storage.getUser(id);
    if (!user || !user.isFake) {
      return res.status(404).json({ message: "Utente finto non trovato" });
    }
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isCurrentlyOnline = user.lastLoginAt && new Date(user.lastLoginAt) >= fifteenMinutesAgo;
    const newLoginAt = isCurrentlyOnline ? new Date("2020-01-01") : new Date();
    await storage.updateUser(id, { lastLoginAt: newLoginAt } as any);
    const overrideUntil = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateUserProfile(id, { adminOverrideUntil: overrideUntil } as any);
    return res.json({ isOnline: !isCurrentlyOnline });
  } catch (error) {
    console.error("Admin toggle fake user online error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/fake-users/:id/conversations", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const convs = await storage.getFakeUserConversations(id);
    return res.json(convs);
  } catch (error) {
    console.error("Admin get fake user conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/fake-users/conversations/:convId/messages", async (req: Request, res: Response) => {
  try {
    const convId = req.params.convId;
    const msgs = await storage.getMessages(convId, 200, 0);
    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, nickname: sender.nickname, userType: sender.userType, isFake: sender.isFake } : null,
        };
      })
    );
    return res.json(result);
  } catch (error) {
    console.error("Admin get fake user conversation messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/chats", async (_req: Request, res: Response) => {
  try {
    const allConvs = await storage.getAllConversations();

    const result = await Promise.all(
      allConvs.map(async (conv) => {
        const participants = await storage.getConversationParticipants(conv.id);
        const participantUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.userId);
            return user
              ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType, isFake: user.isFake }
              : null;
          })
        );
        const msgs = await storage.getMessages(conv.id, 1, 0);
        const lastMessage = msgs[0] || null;

        return {
          ...conv,
          participants: participantUsers.filter(Boolean),
          lastMessage,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Admin get chats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/chats/:id/messages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const conv = await storage.getConversation(id);
    if (!conv) {
      return res.status(404).json({ message: "Conversazione non trovata" });
    }

    const participants = await storage.getConversationParticipants(id);
    const participantUsers = await Promise.all(
      participants.map(async (p) => {
        const user = await storage.getUser(p.userId);
        return user
          ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType, isFake: user.isFake }
          : null;
      })
    );

    const msgs = await storage.getMessages(id, limit, offset);

    const messagesWithSender = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType, isFake: sender.isFake } : null,
        };
      })
    );

    return res.json({
      conversation: conv,
      participants: participantUsers.filter(Boolean),
      messages: messagesWithSender,
    });
  } catch (error) {
    console.error("Admin get chat messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/motoclubs", async (_req: Request, res: Response) => {
  try {
    const clubs = await db.select().from(motoClubs).orderBy(desc(motoClubs.createdAt));
    const result = await Promise.all(clubs.map(async (c) => {
      const members = await db.select().from(motoClubMembers)
        .where(and(eq(motoClubMembers.clubId, c.id), eq(motoClubMembers.status, "active")));
      return { ...c, memberCount: members.length };
    }));
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.delete("/motoclubs/:id", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const clubId = req.params.id;
    await db.delete(motoClubs).where(eq(motoClubs.id, clubId));
    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "delete_motoclub",
      targetType: "motoclub",
      targetId: clubId,
      details: "Club eliminato dall'admin",
    });
    return res.json({ message: "Club eliminato" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/motoclubs/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(motoClubRequests).orderBy(desc(motoClubRequests.createdAt));
    return res.json(requests);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/motoclubs/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const requestId = req.params.id;

    const [request] = await db.select().from(motoClubRequests).where(eq(motoClubRequests.id, requestId)).limit(1);
    if (!request) return res.status(404).json({ message: "Richiesta non trovata" });

    await db.update(motoClubRequests)
      .set({ status: "approved", reviewedBy: adminId, updatedAt: new Date() })
      .where(eq(motoClubRequests.id, requestId));

    const [newClub] = await db.insert(motoClubs).values({
      name: request.name,
      clubType: request.clubType,
      brandName: request.brandName,
      modelName: request.modelName,
      isApproved: true,
      createdBy: request.requestedBy ?? null,
    }).returning();

    const [conv] = await db.insert(conversations).values({
      conversationType: "motoclub",
      title: `Club ${request.name}`,
    }).returning();

    await db.update(motoClubs)
      .set({ conversationId: conv.id })
      .where(eq(motoClubs.id, newClub.id));

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "approve_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: `Approvata richiesta: ${request.name}`,
    });

    return res.json({ message: "Richiesta approvata", club: newClub });
  } catch (e) {
    console.error("[approve motoclub request]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/motoclubs/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const requestId = req.params.id;
    const { note } = req.body as { note?: string };

    await db.update(motoClubRequests)
      .set({ status: "rejected", reviewedBy: adminId, reviewNote: note ?? null, updatedAt: new Date() })
      .where(eq(motoClubRequests.id, requestId));

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "reject_motoclub_request",
      targetType: "motoclub_request",
      targetId: requestId,
      details: note ?? "Richiesta rifiutata",
    });

    return res.json({ message: "Richiesta rifiutata" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/motoclubs/:id", async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const memberships = await db
      .select({
        membershipId: motoClubMembers.id,
        userId: motoClubMembers.userId,
        role: motoClubMembers.role,
        status: motoClubMembers.status,
        joinedAt: motoClubMembers.joinedAt,
        nickname: users.nickname,
        userType: users.userType,
        avatarUrl: users.avatarUrl,
        country: users.country,
        isFake: users.isFake,
      })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")))
      .orderBy(motoClubMembers.joinedAt);

    return res.json({ ...club, members: memberships });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.delete("/motoclubs/:id/members/:userId", async (req: Request, res: Response) => {
  try {
    const adminId = req.session.userId!;
    const { id: clubId, userId } = req.params;

    await db.delete(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId)));

    await db.insert(moderatorLogs).values({
      moderatorId: adminId,
      action: "remove_motoclub_member",
      targetType: "motoclub",
      targetId: clubId,
      details: `Rimosso membro ${userId} dal club ${clubId}`,
    });

    return res.json({ message: "Membro rimosso" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/mass-seed-fake-users", async (_req: Request, res: Response) => {
  try {
    const { getMassSeedStatus, massSeedFakeUsers } = await import("../mass-seed");
    const status = getMassSeedStatus();
    if (status.running) {
      return res.status(409).json({ message: "Generazione già in corso", ...status });
    }
    massSeedFakeUsers().catch((err) => console.error("[mass-seed] background error:", err));
    return res.json({ started: true });
  } catch (error) {
    console.error("Admin mass seed error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/mass-seed-status", async (_req: Request, res: Response) => {
  try {
    const { getMassSeedStatus } = await import("../mass-seed");
    return res.json(getMassSeedStatus());
  } catch (error) {
    console.error("Admin mass seed status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/invitation-codes/stats", async (_req: Request, res: Response) => {
  try {
    const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users).then(r => Number(r[0]?.count ?? 0));
    const usersWithCode = await storage.countUsersWithInvitationCode();
    const codes = await storage.getInvitationCodes();
    const perCode = await Promise.all(
      codes.map(async (c) => ({
        code: c.code,
        label: c.label ?? c.code,
        count: await storage.countUsersByInvitationCode(c.code),
        isActive: c.isActive,
        currentUses: c.currentUses,
        maxUses: c.maxUses,
      }))
    );
    return res.json({ totalUsers, usersWithCode, perCode });
  } catch (error) {
    console.error("Admin invitation stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/invitation-codes", async (_req: Request, res: Response) => {
  try {
    const codes = await storage.getInvitationCodes();
    return res.json(codes);
  } catch (error) {
    console.error("Admin invitation list error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/invitation-codes", async (req: Request, res: Response) => {
  try {
    const { code, label, giftMessage, maxUses, expiresAt } = req.body;
    if (!code || typeof code !== "string" || code.trim().length < 2) {
      return res.status(400).json({ message: "Codice non valido (minimo 2 caratteri)" });
    }
    const created = await storage.createInvitationCode({
      code: code.trim().toUpperCase(),
      label: label?.trim() || null,
      giftMessage: giftMessage?.trim() || null,
      createdBy: (req as any).currentUser?.id ?? null,
      maxUses: Number(maxUses) || 100,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Codice già esistente" });
    }
    console.error("Admin invitation create error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.put("/invitation-codes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, giftMessage, maxUses, isActive, expiresAt } = req.body;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });

    const updated = await storage.updateInvitationCode(id, {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(giftMessage !== undefined && { giftMessage: giftMessage?.trim() || null }),
      ...(maxUses !== undefined && { maxUses: Number(maxUses) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : undefined }),
    });
    return res.json(updated);
  } catch (error) {
    console.error("Admin invitation update error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/invitation-codes/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await storage.getInvitationCodeById(id);
    if (!existing) return res.status(404).json({ message: "Codice non trovato" });
    await storage.deleteInvitationCode(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Admin invitation delete error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/email-status", async (_req: Request, res: Response) => {
  try {
    const userSetting = await storage.getAppSetting("gmail_user");
    const passSetting = await storage.getAppSetting("gmail_app_password");
    const hasDbCreds = !!(userSetting?.value && passSetting?.value);
    const hasEnvCreds = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const configured = hasDbCreds || hasEnvCreds;
    const maskedEmail = hasDbCreds
      ? userSetting!.value!.replace(/(.{2}).*(@.*)/, "$1***$2")
      : hasEnvCreds
      ? process.env.GMAIL_USER!.replace(/(.{2}).*(@.*)/, "$1***$2")
      : null;
    return res.json({ configured, maskedEmail });
  } catch (error) {
    console.error("Admin email status error:", error);
    return res.status(500).json({ configured: false, maskedEmail: null });
  }
});

router.get("/db-stats", async (_req: Request, res: Response) => {
  try {
    const {
      users: usersTable,
      userProfiles,
      conversations,
      messages,
      motoClubs,
      motoClubMembers,
      motoClubRequests,
      workshops,
      reports,
      invitationCodes,
      proposals,
      userMotorcycles,
      easterEggs,
      collectedEasterEggs,
      adCampaigns,
      moderatorLogs,
      notifications,
      routes,
      feedbackTickets,
    } = await import("../../shared/schema");
    const { count: countFn, desc: descFn } = await import("drizzle-orm");

    const [
      [usersCount],
      usersRecent,
      [userProfilesCount],
      userProfilesRecent,
      [conversationsCount],
      conversationsRecent,
      [messagesCount],
      messagesRecent,
      [motoClubsCount],
      motoClubsRecent,
      [motoClubMembersCount],
      motoClubMembersRecent,
      [motoClubRequestsCount],
      motoClubRequestsRecent,
      [workshopsCount],
      workshopsRecent,
      [reportsCount],
      reportsRecent,
      [invitationCodesCount],
      invitationCodesRecent,
      [proposalsCount],
      proposalsRecent,
      [userMotorcyclesCount],
      userMotorcyclesRecent,
      [easterEggsCount],
      easterEggsRecent,
      [collectedEasterEggsCount],
      collectedEasterEggsRecent,
      [adCampaignsCount],
      adCampaignsRecent,
      [moderatorLogsCount],
      moderatorLogsRecent,
      [notificationsCount],
      notificationsRecent,
      [routesCount],
      routesRecent,
      [feedbackTicketsCount],
      feedbackTicketsRecent,
    ] = await Promise.all([
      db.select({ total: countFn() }).from(usersTable),
      db.select({ id: usersTable.id, createdAt: usersTable.createdAt, label: usersTable.nickname, email: usersTable.email, role: usersTable.role, status: usersTable.status }).from(usersTable).orderBy(descFn(usersTable.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userProfiles),
      db.select({ id: userProfiles.id, createdAt: userProfiles.updatedAt, label: userProfiles.userId }).from(userProfiles).orderBy(descFn(userProfiles.updatedAt)).limit(5),
      db.select({ total: countFn() }).from(conversations),
      db.select({ id: conversations.id, createdAt: conversations.createdAt, label: conversations.title, conversationType: conversations.conversationType }).from(conversations).orderBy(descFn(conversations.createdAt)).limit(5),
      db.select({ total: countFn() }).from(messages),
      db.select({ id: messages.id, createdAt: messages.createdAt, label: messages.content, messageType: messages.messageType }).from(messages).orderBy(descFn(messages.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubs),
      db.select({ id: motoClubs.id, createdAt: motoClubs.createdAt, label: motoClubs.name, clubType: motoClubs.clubType, isApproved: motoClubs.isApproved }).from(motoClubs).orderBy(descFn(motoClubs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubMembers),
      db.select({ id: motoClubMembers.id, createdAt: motoClubMembers.joinedAt, label: motoClubMembers.userId, clubId: motoClubMembers.clubId, role: motoClubMembers.role }).from(motoClubMembers).orderBy(descFn(motoClubMembers.joinedAt)).limit(5),
      db.select({ total: countFn() }).from(motoClubRequests),
      db.select({ id: motoClubRequests.id, createdAt: motoClubRequests.createdAt, label: motoClubRequests.name, status: motoClubRequests.status }).from(motoClubRequests).orderBy(descFn(motoClubRequests.createdAt)).limit(5),
      db.select({ total: countFn() }).from(workshops),
      db.select({ id: workshops.id, createdAt: workshops.createdAt, label: workshops.name, isApproved: workshops.isApproved }).from(workshops).orderBy(descFn(workshops.createdAt)).limit(5),
      db.select({ total: countFn() }).from(reports),
      db.select({ id: reports.id, createdAt: reports.createdAt, label: reports.reason, status: reports.status }).from(reports).orderBy(descFn(reports.createdAt)).limit(5),
      db.select({ total: countFn() }).from(invitationCodes),
      db.select({ id: invitationCodes.id, createdAt: invitationCodes.createdAt, label: invitationCodes.code, isActive: invitationCodes.isActive }).from(invitationCodes).orderBy(descFn(invitationCodes.createdAt)).limit(5),
      db.select({ total: countFn() }).from(proposals),
      db.select({ id: proposals.id, createdAt: proposals.createdAt, label: proposals.title, status: proposals.status }).from(proposals).orderBy(descFn(proposals.createdAt)).limit(5),
      db.select({ total: countFn() }).from(userMotorcycles),
      db.select({ id: userMotorcycles.id, createdAt: userMotorcycles.createdAt, label: userMotorcycles.brand, model: userMotorcycles.model }).from(userMotorcycles).orderBy(descFn(userMotorcycles.createdAt)).limit(5),
      db.select({ total: countFn() }).from(easterEggs),
      db.select({ id: easterEggs.id, createdAt: easterEggs.createdAt, label: easterEggs.name, isActive: easterEggs.isActive }).from(easterEggs).orderBy(descFn(easterEggs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(collectedEasterEggs),
      db.select({ id: collectedEasterEggs.id, createdAt: collectedEasterEggs.collectedAt, label: collectedEasterEggs.easterEggId, userId: collectedEasterEggs.userId }).from(collectedEasterEggs).orderBy(descFn(collectedEasterEggs.collectedAt)).limit(5),
      db.select({ total: countFn() }).from(adCampaigns),
      db.select({ id: adCampaigns.id, createdAt: adCampaigns.createdAt, label: adCampaigns.name, isActive: adCampaigns.isActive }).from(adCampaigns).orderBy(descFn(adCampaigns.createdAt)).limit(5),
      db.select({ total: countFn() }).from(moderatorLogs),
      db.select({ id: moderatorLogs.id, createdAt: moderatorLogs.createdAt, label: moderatorLogs.action, targetType: moderatorLogs.targetType }).from(moderatorLogs).orderBy(descFn(moderatorLogs.createdAt)).limit(5),
      db.select({ total: countFn() }).from(notifications),
      db.select({ id: notifications.id, createdAt: notifications.createdAt, label: notifications.title, notificationType: notifications.notificationType }).from(notifications).orderBy(descFn(notifications.createdAt)).limit(5),
      db.select({ total: countFn() }).from(routes),
      db.select({ id: routes.id, createdAt: routes.createdAt, label: routes.title, status: routes.status }).from(routes).orderBy(descFn(routes.createdAt)).limit(5),
      db.select({ total: countFn() }).from(feedbackTickets),
      db.select({ id: feedbackTickets.id, createdAt: feedbackTickets.createdAt, label: feedbackTickets.subject, status: feedbackTickets.status, ticketType: feedbackTickets.ticketType }).from(feedbackTickets).orderBy(descFn(feedbackTickets.createdAt)).limit(5),
    ]);

    return res.json({
      tables: [
        { name: "users", label: "Utenti", total: Number(usersCount?.total ?? 0), recent: usersRecent },
        { name: "userProfiles", label: "Profili Utente", total: Number(userProfilesCount?.total ?? 0), recent: userProfilesRecent },
        { name: "conversations", label: "Conversazioni", total: Number(conversationsCount?.total ?? 0), recent: conversationsRecent },
        { name: "messages", label: "Messaggi", total: Number(messagesCount?.total ?? 0), recent: messagesRecent },
        { name: "motoClubs", label: "Motoclub", total: Number(motoClubsCount?.total ?? 0), recent: motoClubsRecent },
        { name: "motoClubMembers", label: "Membri Motoclub", total: Number(motoClubMembersCount?.total ?? 0), recent: motoClubMembersRecent },
        { name: "motoClubRequests", label: "Richieste Motoclub", total: Number(motoClubRequestsCount?.total ?? 0), recent: motoClubRequestsRecent },
        { name: "workshops", label: "Officine", total: Number(workshopsCount?.total ?? 0), recent: workshopsRecent },
        { name: "reports", label: "Segnalazioni", total: Number(reportsCount?.total ?? 0), recent: reportsRecent },
        { name: "invitationCodes", label: "Codici Invito", total: Number(invitationCodesCount?.total ?? 0), recent: invitationCodesRecent },
        { name: "proposals", label: "Proposte", total: Number(proposalsCount?.total ?? 0), recent: proposalsRecent },
        { name: "userMotorcycles", label: "Moto Utenti", total: Number(userMotorcyclesCount?.total ?? 0), recent: userMotorcyclesRecent },
        { name: "easterEggs", label: "Easter Eggs", total: Number(easterEggsCount?.total ?? 0), recent: easterEggsRecent },
        { name: "collectedEasterEggs", label: "Easter Eggs Raccolti", total: Number(collectedEasterEggsCount?.total ?? 0), recent: collectedEasterEggsRecent },
        { name: "adCampaigns", label: "Campagne Ad", total: Number(adCampaignsCount?.total ?? 0), recent: adCampaignsRecent },
        { name: "moderatorLogs", label: "Log Moderatori", total: Number(moderatorLogsCount?.total ?? 0), recent: moderatorLogsRecent },
        { name: "notifications", label: "Notifiche", total: Number(notificationsCount?.total ?? 0), recent: notificationsRecent },
        { name: "routes", label: "Percorsi", total: Number(routesCount?.total ?? 0), recent: routesRecent },
        { name: "feedbackTickets", label: "Feedback Ticket", total: Number(feedbackTicketsCount?.total ?? 0), recent: feedbackTicketsRecent },
      ],
    });
  } catch (error) {
    console.error("Admin db-stats error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/fake-users/wake-all", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const fakeUsers = await db.select({ id: users.id, country: users.country }).from(users).where(eq(users.isFake, true));
    for (const fu of fakeUsers) {
      const update: Record<string, unknown> = { lastLoginAt: now };
      if (!fu.country) update.country = "IT";
      await db.update(users).set(update as any).where(eq(users.id, fu.id));
      await db.update(userProfiles).set({ isAvailable: true }).where(eq(userProfiles.userId, fu.id));
    }
    return res.json({ ok: true, count: fakeUsers.length });
  } catch (error) {
    console.error("Admin wake-all fake users error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/backup/status", async (_req: Request, res: Response) => {
  try {
    const { getBackupStatus } = await import("../backup-service");
    return res.json(await getBackupStatus());
  } catch (error) {
    console.error("Admin backup status error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/backup/list", async (_req: Request, res: Response) => {
  try {
    const { listBackups } = await import("../backup-service");
    const result = await listBackups();
    return res.json(result);
  } catch (error) {
    console.error("Admin backup list error:", error);
    return res.status(500).json({ message: "Errore durante il recupero dei backup" });
  }
});

router.post("/backup/db", async (_req: Request, res: Response) => {
  try {
    const { backupDatabase, purgeOldBackups } = await import("../backup-service");
    const result = await backupDatabase();
    purgeOldBackups().catch((e: Error) => console.error("[backup] purge error:", e.message));
    await storage.createModeratorLog({
      moderatorId: (_req as any).currentUser?.id || "system",
      action: "backup_db",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup DB eseguito: ${result.name} (${result.size} bytes)`,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Admin backup db error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup del database" });
  }
});

router.post("/backup/media", async (_req: Request, res: Response) => {
  try {
    const { backupMedia, purgeOldBackups } = await import("../backup-service");
    const result = await backupMedia();
    purgeOldBackups().catch((e: Error) => console.error("[backup] purge error:", e.message));
    await storage.createModeratorLog({
      moderatorId: (_req as any).currentUser?.id || "system",
      action: "backup_media",
      targetType: "system",
      targetId: result.name.slice(0, 36),
      details: `Backup media eseguito: ${result.name} (${result.size} bytes)`,
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Admin backup media error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il backup dei media" });
  }
});

router.post("/backup/restore", async (req: Request, res: Response) => {
  try {
    const { filePath, adminPassword } = req.body;
    if (!filePath || !adminPassword) {
      return res.status(400).json({ message: "filePath e adminPassword sono obbligatori" });
    }
    const user = (req as any).currentUser;
    const fullUser = await storage.getUser(user.id);
    if (!fullUser || !fullUser.password) {
      return res.status(403).json({ message: "Utente non trovato" });
    }
    const valid = await bcrypt.compare(adminPassword, fullUser.password);
    if (!valid) {
      return res.status(401).json({ message: "Password non corretta" });
    }
    const { restoreDatabase } = await import("../backup-service");
    await restoreDatabase(filePath);
    const backupName = (filePath as string).split("/").pop() ?? filePath;
    await storage.createModeratorLog({
      moderatorId: user.id,
      action: "restore_db",
      targetType: "system",
      targetId: (backupName as string).slice(0, 36),
      details: `Database ripristinato dal backup: ${filePath}`,
    });
    return res.json({ ok: true, message: "Database ripristinato con successo" });
  } catch (error: any) {
    console.error("Admin restore db error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il ripristino del database" });
  }
});

router.get("/backup/download", async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ message: "Parametro path mancante" });
    }
    if (!filePath.startsWith("backup/")) {
      return res.status(400).json({ message: "Path non valido" });
    }
    const { downloadBackupBuffer } = await import("../backup-service");
    const buf = await downloadBackupBuffer(filePath);
    const fileName = filePath.split("/").pop() ?? "backup";
    const contentType = fileName.endsWith(".gz")
      ? "application/gzip"
      : "application/zip";
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  } catch (error: any) {
    console.error("Admin backup download error:", error);
    return res.status(500).json({ message: error.message || "Errore durante il download" });
  }
});

router.put("/backup/schedule", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled deve essere un booleano" });
    }
    const { setAutoBackupEnabled } = await import("../backup-service");
    await setAutoBackupEnabled(enabled);
    return res.json({ ok: true, enabled });
  } catch (error: any) {
    console.error("Admin backup schedule error:", error);
    return res.status(500).json({ message: error.message || "Errore durante la configurazione del backup" });
  }
});

export default router;
