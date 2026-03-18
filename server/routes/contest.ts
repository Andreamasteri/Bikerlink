import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "../storage";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "contest");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const contestStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: contestStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini consentite"));
    }
  },
});

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

router.post("/entries", upload.single("photo"), async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const caption = req.body.caption || null;
    const performanceData = req.body.performanceData || null;

    let photoUrl: string | null = null;

    if (req.file) {
      photoUrl = `/uploads/contest/${req.file.filename}`;
    } else if (req.body.photoUrl) {
      photoUrl = req.body.photoUrl;
    }

    if (!photoUrl && !performanceData) {
      return res.status(400).json({ message: "Foto o dati performance obbligatori" });
    }

    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const year = now.getFullYear();

    const entry = await storage.createPhotoContestEntry({
      userId,
      photoUrl,
      caption,
      performanceData: performanceData ? (typeof performanceData === "string" ? performanceData : JSON.stringify(performanceData)) : null,
      weekNumber,
      year,
      isApproved: true,
    });

    return res.status(201).json(entry);
  } catch (error) {
    console.error("Contest entry error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/entries", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const now = new Date();
    let weekNumber = parseInt(req.query.week as string) || getWeekNumber(now);
    let year = parseInt(req.query.year as string) || now.getFullYear();

    const entries = await storage.getPhotoContestEntries(weekNumber, year);

    const today = now.toISOString().split("T")[0];
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    const votesUsed = dailyCount?.count ?? 0;

    const entriesWithVoteInfo = await Promise.all(
      entries.map(async (entry) => {
        const existingVote = await storage.getPhotoVote(entry.id, userId);
        return {
          ...entry,
          hasVoted: !!existingVote,
          isOwn: entry.userId === userId,
        };
      })
    );

    return res.json({
      entries: entriesWithVoteInfo,
      weekNumber,
      year,
      votesUsed,
      maxVotesPerDay: 10,
    });
  } catch (error) {
    console.error("Contest entries error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/entries/:id/vote", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { id } = req.params;

    const entries = await storage.getPhotoContestEntries(0, 0);
    let entry = null;
    const allEntries = await storage.getPhotoContestEntries(
      getWeekNumber(new Date()),
      new Date().getFullYear()
    );
    entry = allEntries.find((e) => e.id === id);

    if (!entry) {
      const now = new Date();
      const prevWeek = getWeekNumber(new Date(now.getTime() - 7 * 86400000));
      const prevYear = new Date(now.getTime() - 7 * 86400000).getFullYear();
      const prevEntries = await storage.getPhotoContestEntries(prevWeek, prevYear);
      entry = prevEntries.find((e) => e.id === id);
    }

    if (!entry) {
      return res.status(404).json({ message: "Foto non trovata" });
    }

    if (entry.userId === userId) {
      return res.status(400).json({ message: "Non puoi votare la tua foto" });
    }

    const entryId = Array.isArray(id) ? id[0] : id;
    const existingVote = await storage.getPhotoVote(entryId, userId);
    if (existingVote) {
      return res.status(400).json({ message: "Hai già votato questa foto" });
    }

    const today = new Date().toISOString().split("T")[0] as string;
    const dailyCount = await storage.getDailyVoteCount(userId, today);
    if (dailyCount && dailyCount.count >= 10) {
      return res.status(400).json({ message: "Hai raggiunto il limite di 10 voti giornalieri" });
    }

    await storage.createPhotoVote({ entryId, userId });
    await storage.incrementEntryVotes(entryId);
    await storage.upsertDailyVoteCount(userId, today);

    return res.json({ message: "Voto registrato" });
  } catch (error) {
    console.error("Contest vote error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/winners", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const winners = await storage.getPhotoWinners();
    return res.json(winners);
  } catch (error) {
    console.error("Contest winners error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
