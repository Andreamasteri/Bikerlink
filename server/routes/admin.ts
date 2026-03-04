import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { storage } from "../storage";

export const adminRouter = Router();

adminRouter.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    res.json({
      users: users.map(u => {
        const { passwordHash: _, ...safe } = u;
        return safe;
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento utenti" });
  }
});

adminRouter.put("/users/:id/block", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await storage.updateUser(req.params.id, { status: "blocked" });
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    res.json({ message: "Utente bloccato", user: { ...user, passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Errore nel blocco utente" });
  }
});

adminRouter.put("/users/:id/suspend", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { hours } = req.body;
    const suspendedUntil = new Date(Date.now() + (hours || 24) * 60 * 60 * 1000);
    const user = await storage.updateUser(req.params.id, { status: "suspended", suspendedUntil });
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    res.json({ message: `Utente sospeso per ${hours || 24} ore`, user: { ...user, passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Errore nella sospensione utente" });
  }
});

adminRouter.put("/users/:id/unblock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await storage.updateUser(req.params.id, { status: "active", suspendedUntil: null });
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    res.json({ message: "Utente sbloccato", user: { ...user, passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Errore nello sblocco utente" });
  }
});

adminRouter.put("/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password non valida (minimo 6 caratteri)" });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await storage.updateUser(req.params.id, { passwordHash });
    res.json({ message: "Password resettata con successo" });
  } catch (err) {
    res.status(500).json({ message: "Errore nel reset password" });
  }
});

adminRouter.put("/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) {
      return res.status(400).json({ message: "Ruolo non valido" });
    }
    const user = await storage.updateUser(req.params.id, { role });
    if (!user) return res.status(404).json({ message: "Utente non trovato" });
    res.json({ message: `Ruolo aggiornato a ${role}`, user: { ...user, passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento ruolo" });
  }
});

adminRouter.get("/ads", requireAuth, requireAdmin, async (req, res) => {
  try {
    const ads = await storage.getAllAds();
    res.json({ ads });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento annunci" });
  }
});

adminRouter.post("/ads", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, imageUrl, targetUrl, productType, displayMode, isActive, priority } = req.body;
    if (!title || !imageUrl || !productType) {
      return res.status(400).json({ message: "Dati obbligatori mancanti" });
    }
    const ad = await storage.createAd({ title, imageUrl, targetUrl, productType, displayMode, isActive, priority });
    res.status(201).json({ ad });
  } catch (err) {
    res.status(500).json({ message: "Errore nella creazione annuncio" });
  }
});

adminRouter.put("/ads/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const ad = await storage.updateAd(req.params.id, req.body);
    if (!ad) return res.status(404).json({ message: "Annuncio non trovato" });
    res.json({ ad });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento annuncio" });
  }
});

adminRouter.delete("/ads/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await storage.deleteAd(req.params.id);
    res.json({ message: "Annuncio eliminato" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'eliminazione annuncio" });
  }
});

adminRouter.get("/workshops", requireAuth, requireAdmin, async (req, res) => {
  try {
    const workshops = await storage.getAllWorkshops();
    res.json({ workshops });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento officine" });
  }
});

adminRouter.put("/workshops/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const ws = await storage.updateWorkshop(req.params.id, { isApproved: true });
    if (!ws) return res.status(404).json({ message: "Officina non trovata" });
    res.json({ workshop: ws, message: "Officina approvata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'approvazione officina" });
  }
});

adminRouter.delete("/workshops/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await storage.deleteWorkshop(req.params.id);
    res.json({ message: "Officina eliminata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'eliminazione officina" });
  }
});

adminRouter.get("/workshop-contacts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const contacts = await storage.getWorkshopContacts();
    res.json({
      contacts: contacts.map(c => ({
        ...c.contact,
        workshop: c.workshop,
        user: { ...c.user, passwordHash: undefined },
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento contatti" });
  }
});

adminRouter.get("/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await storage.getAllSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento impostazioni" });
  }
});

adminRouter.put("/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await storage.setSetting(key, String(value));
    }
    res.json({ message: "Impostazioni aggiornate" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento impostazioni" });
  }
});

adminRouter.get("/easter-eggs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const eggs = await storage.getAllEasterEggs();
    res.json({ easterEggs: eggs });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento easter eggs" });
  }
});

adminRouter.post("/easter-eggs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, iconUrl, lat, lng, radius, isActive } = req.body;
    if (!name || !lat || !lng) {
      return res.status(400).json({ message: "Dati obbligatori mancanti" });
    }
    const egg = await storage.createEasterEgg({ name, description, iconUrl, lat, lng, radius: radius || 50, isActive: isActive !== false });
    res.status(201).json({ easterEgg: egg });
  } catch (err) {
    res.status(500).json({ message: "Errore nella creazione easter egg" });
  }
});

adminRouter.put("/easter-eggs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const egg = await storage.updateEasterEgg(req.params.id, req.body);
    if (!egg) return res.status(404).json({ message: "Easter egg non trovato" });
    res.json({ easterEgg: egg });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento easter egg" });
  }
});

adminRouter.delete("/easter-eggs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await storage.deleteEasterEgg(req.params.id);
    res.json({ message: "Easter egg eliminato" });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'eliminazione easter egg" });
  }
});

adminRouter.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  try {
    const reports = await storage.getReports();
    res.json({
      reports: reports.map(r => ({
        ...r.report,
        reporter: { ...r.reporter, passwordHash: undefined },
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento segnalazioni" });
  }
});

adminRouter.put("/reports/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const report = await storage.updateReport(req.params.id, { status, adminNotes });
    if (!report) return res.status(404).json({ message: "Segnalazione non trovata" });
    res.json({ report });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'aggiornamento segnalazione" });
  }
});

adminRouter.get("/moderator-logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await storage.getModeratorLogs();
    res.json({
      logs: logs.map(l => ({
        ...l.log,
        moderator: { ...l.moderator, passwordHash: undefined },
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento log moderatori" });
  }
});

adminRouter.get("/analytics", requireAuth, requireAdmin, async (req, res) => {
  try {
    const analytics = await storage.getAnalytics();
    res.json({ analytics });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento analytics" });
  }
});

adminRouter.get("/export/syneco", requireAuth, requireAdmin, async (req, res) => {
  try {
    const analytics = await storage.getAnalytics();
    const contacts = await storage.getWorkshopContacts();
    const ads = await storage.getAllAds();

    let csv = "Tipo,Valore\n";
    csv += `Utenti totali,${analytics.totalUsers}\n`;
    csv += `Utenti attivi oggi,${analytics.activeToday}\n`;
    csv += `Percorsi pubblicati,${analytics.totalRoutes}\n`;
    csv += `Click totali annunci,${analytics.totalAdClicks}\n\n`;

    csv += "Annuncio,Click,Impressioni,Tipo Prodotto\n";
    for (const ad of ads) {
      csv += `"${ad.title}",${ad.clickCount},${ad.impressionCount},${ad.productType}\n`;
    }

    csv += "\nOfficina,Tipo Contatto,Data\n";
    for (const c of contacts) {
      csv += `"${c.workshop.name}","${c.contact.contactType}","${new Date(c.contact.createdAt).toLocaleDateString("it-IT")}"\n`;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=syneco-report-${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: "Errore nell'esportazione" });
  }
});

adminRouter.get("/settings/backup", requireAuth, requireAdmin, async (req, res) => {
  const enabled = await storage.getSetting("gdrive_backup_enabled");
  res.json({ enabled: enabled === "true", status: "coming_soon" });
});

adminRouter.get("/settings/paypal", requireAuth, requireAdmin, async (req, res) => {
  const enabled = await storage.getSetting("paypal_enabled");
  res.json({ enabled: enabled === "true", status: "coming_soon" });
});
