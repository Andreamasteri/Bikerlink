import { type Request, type Response } from "express";

export function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return;
  }
  next();
}

export function requireUserId(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}
