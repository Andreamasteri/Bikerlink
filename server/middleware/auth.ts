import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Accesso non autorizzato" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Utente non trovato" });
  }

  if (user.status === "blocked") {
    return res.status(403).json({ message: "Account bloccato. Contatta l'amministratore." });
  }

  if (user.status === "suspended" && user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    return res.status(403).json({ message: `Account sospeso fino al ${new Date(user.suspendedUntil).toLocaleDateString("it-IT")}` });
  }

  if (user.status === "suspended" && (!user.suspendedUntil || new Date(user.suspendedUntil) <= new Date())) {
    await storage.updateUser(user.id, { status: "active", suspendedUntil: null });
  }

  (req as any).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Accesso riservato all'amministratore" });
  }
  next();
}

export function requireModerator(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || (user.role !== "moderator" && user.role !== "admin")) {
    return res.status(403).json({ message: "Accesso riservato ai moderatori" });
  }
  next();
}
