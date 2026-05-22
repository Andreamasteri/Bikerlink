import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "../../db";
import { userLastfmSessions, userMusicTracks } from "@shared/db";
import { eq, and } from "drizzle-orm";
import { isLastfmConfigured, lastfmApiCall } from "./utils";
import { syncLastfmTracks } from "./sync-utils";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.post("/mobile-auth", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return sendError(res, 503, "Last.fm non configurato. Contatta l'amministratore.");
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return sendError(res, 400, "Username e password sono obbligatori.");
  }
  const userId = req.session.userId!;

  let sessionKey: string;
  let lastfmUsername: string;

  try {
    const passwordMd5 = crypto.createHash("md5").update(password, "utf8").digest("hex");
    const sessionData = await lastfmApiCall({
      method: "auth.getMobileSession",
      username,
      password: passwordMd5,
    }, "POST") as { session?: { key?: string; name?: string }; error?: number; message?: string };

    if (sessionData?.error) {
      const code = sessionData.error;
      console.warn(`[Last.fm mobile-auth] error code=${code} msg=${sessionData.message}`);
      let errMsg: string;
      if (code === 4) {
        errMsg = "Credenziali non valide. Assicurati di usare username e password corretti. Se hai appena creato l'account, verifica prima l'email di conferma che Last.fm ti ha inviato.";
      } else if (code === 26) {
        errMsg = "Accesso API Last.fm non autorizzato. Contatta l'assistenza.";
      } else {
        errMsg = sessionData.message ?? "Credenziali non valide. Riprova.";
      }
      return sendError(res, 401, errMsg);
    }

    const key = sessionData?.session?.key;
    if (!key) {
      return sendError(res, 400, "Autorizzazione Last.fm fallita. Controlla username e password.");
    }
    sessionKey = key;
    lastfmUsername = sessionData?.session?.name ?? username;
  } catch (err) {
    console.error("[Last.fm mobile-auth] auth error:", err);
    return sendError(res, 401, (err as Error).message ?? "Errore nella connessione Last.fm. Riprova.");
  }

  try {
    await db
      .insert(userLastfmSessions)
      .values({ userId, lastfmUsername, sessionKey })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername, sessionKey, connectedAt: new Date() },
      });

    let trackCount = 0;
    try {
      trackCount = await syncLastfmTracks(userId, sessionKey, lastfmUsername);
    } catch (syncErr) {
      console.error("[Last.fm mobile-auth] sync brani fallita (login già salvato):", syncErr);
    }

    return res.json({ connected: true, username: lastfmUsername, trackCount });
  } catch (err) {
    console.error("[Last.fm mobile-auth] DB error:", err);
    return sendError(res, 500, "Errore nel salvataggio della sessione Last.fm.");
  }
});

router.get("/auth-token", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return sendError(res, 503, "Last.fm non configurato.");
  }
  try {
    const data = await lastfmApiCall({ method: "auth.getToken" }) as { token?: string; error?: number; message?: string };
    if (data?.error || !data?.token) {
      console.warn(`[Last.fm auth-token] error=${data?.error} msg=${data?.message}`);
      return sendError(res, 500, data?.message ?? "Impossibile ottenere il token Last.fm.");
    }
    const apiKey = process.env.LASTFM_API_KEY!;
    const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${data.token}&cb=bikerlink://lastfm-callback`;
    return res.json({ token: data.token, authUrl });
  } catch (err) {
    console.error("[Last.fm auth-token]", err);
    return sendError(res, 500, "Errore di connessione a Last.fm.");
  }
});

router.post("/auth-session", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return sendError(res, 503, "Last.fm non configurato.");
  }
  const { token } = req.body as { token?: string };
  if (!token) return sendError(res, 400, "Token mancante.");
  const userId = req.session.userId!;
  try {
    const data = await lastfmApiCall({ method: "auth.getSession", token }, "POST") as { session?: { key?: string; name?: string }; error?: number; message?: string };
    if (data?.error) {
      const code = data.error;
      console.warn(`[Last.fm auth-session] error code=${code} msg=${data.message}`);
      if (code === 14) {
        return sendError(res, 401, "Non hai ancora autorizzato l'app su Last.fm. Apri il link, accedi e clicca 'Sì, permetti l'accesso', poi torna qui e riprova.");
      }
      return sendError(res, 401, data.message ?? "Autorizzazione negata. Riprova.");
    }
    const key = data?.session?.key;
    const lastfmUsername = data?.session?.name;
    if (!key || !lastfmUsername) {
      return sendError(res, 400, "Autorizzazione Last.fm fallita. Riprova.");
    }
    await db.insert(userLastfmSessions)
      .values({ userId, lastfmUsername, sessionKey: key })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername, sessionKey: key, connectedAt: new Date() },
      });
    let trackCount = 0;
    try {
      trackCount = await syncLastfmTracks(userId, key, lastfmUsername);
    } catch (syncErr) {
      console.error("[Last.fm auth-session] sync brani fallita:", syncErr);
    }
    return res.json({ connected: true, username: lastfmUsername, trackCount });
  } catch (err) {
    console.error("[Last.fm auth-session] error:", err);
    return sendError(res, 500, (err as Error).message ?? "Errore di connessione a Last.fm.");
  }
});

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    const [session] = await db
      .select()
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    if (!session) {
      return res.json({ connected: false, username: null, trackCount: 0 });
    }

    const tracks = await db
      .select({ id: userMusicTracks.id })
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")));

    return res.json({
      connected: true,
      username: session.lastfmUsername,
      trackCount: tracks.length,
    });
  } catch (err) {
    console.error("[Last.fm status]", err);
    return sendError(res, 500, "Errore nel recupero stato Last.fm");
  }
});

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    await db.delete(userLastfmSessions).where(eq(userLastfmSessions.userId, userId));
    return res.json({ disconnected: true });
  } catch (err) {
    console.error("[Last.fm disconnect]", err);
    return sendError(res, 500, "Errore nella disconnessione");
  }
});

export default router;
