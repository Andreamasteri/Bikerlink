import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { storage } from "../storage";

export const contestRouter = Router();

contestRouter.post("/submit", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { photoUrl, caption, routeId } = req.body;

    if (!photoUrl) {
      return res.status(400).json({ message: "URL foto obbligatorio" });
    }

    const entry = await storage.submitContestPhoto({
      userId: user.id,
      photoUrl,
      caption,
      routeId,
    });

    res.status(201).json({ entry });
  } catch (err) {
    res.status(500).json({ message: "Errore nell'invio foto al concorso" });
  }
});

contestRouter.get("/current", requireAuth, async (req, res) => {
  try {
    const entries = await storage.getCurrentContestEntries();
    const userId = (req as any).user.id;
    const dailyVotes = await storage.getDailyVoteCount(userId);

    res.json({
      entries: entries.map(e => {
        const { passwordHash: _, ...safeUser } = e.user;
        return { ...e.entry, user: safeUser, voteCount: e.voteCount };
      }),
      dailyVotesUsed: dailyVotes,
      maxDailyVotes: 10,
      contentPolicy: "Non sono ammesse foto volgari, contenenti droga, sesso esplicito o scatti da pinup. Le foto inappropriate verranno segnalate e l'utente ammonito.",
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento concorso" });
  }
});

contestRouter.post("/:photoId/vote", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    await storage.voteForPhoto(req.params.photoId, user.id);
    const dailyVotes = await storage.getDailyVoteCount(user.id);
    res.json({ message: "Voto registrato", dailyVotesUsed: dailyVotes });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Errore nel voto" });
  }
});

contestRouter.get("/winners", requireAuth, async (req, res) => {
  try {
    const winners = await storage.getContestWinners();
    res.json({
      winners: winners.map(w => {
        const { passwordHash: _, ...safeUser } = w.user;
        return { ...w.winner, photo: w.photo, user: safeUser };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento vincitori" });
  }
});

contestRouter.get("/photo-of-the-week", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const weekNumber = getWeekNumber(now);
    const yearNumber = now.getFullYear();

    if (now.getDay() === 0) {
      const prevWeek = weekNumber - 1;
      const prevYear = prevWeek <= 0 ? yearNumber - 1 : yearNumber;
      const actualPrevWeek = prevWeek <= 0 ? 52 : prevWeek;
      await storage.finalizeWeekWinner(actualPrevWeek, prevYear);
    }

    const winners = await storage.getContestWinners();
    const latest = winners.length > 0 ? winners[0] : null;

    if (!latest) {
      return res.json({ winner: null });
    }

    const { passwordHash: _, ...safeUser } = latest.user;
    res.json({
      winner: { ...latest.winner, photo: latest.photo, user: safeUser },
    });
  } catch (err) {
    res.status(500).json({ message: "Errore nel caricamento foto della settimana" });
  }
});

contestRouter.post("/:photoId/report", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { description } = req.body;

    await storage.createReport({
      reporterId: user.id,
      reportedUserId: req.params.photoId,
      category: "foto_inappropriata",
      description: description || "Foto segnalata dal concorso",
    });

    res.json({ message: "Segnalazione inviata" });
  } catch (err) {
    res.status(500).json({ message: "Errore nella segnalazione" });
  }
});

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
