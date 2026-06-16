import { type Request, type Response } from "express";
import { sendError } from "./api-response";

export function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!req.session.userId) {
    sendError(res, 401, "Non autenticato");
    return;
  }
  next();
}

export function requireUserId(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    sendError(res, 401, "Non autenticato");
    return null;
  }
  return req.session.userId;
}
