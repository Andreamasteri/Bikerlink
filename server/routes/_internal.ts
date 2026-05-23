import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

const EXPORTS_DIR = path.resolve(process.cwd(), "exports");

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) {
      // Still run timingSafeEqual on same-length buffers to avoid timing leak on length
      const padded = Buffer.alloc(bufA.length);
      bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
      crypto.timingSafeEqual(bufA, padded);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function requireExportToken(req: Request, res: Response): boolean {
  const expectedToken = process.env.CHAT_EXPORT_TOKEN;
  if (!expectedToken) {
    res.status(503).json({ message: "Export non configurato (CHAT_EXPORT_TOKEN mancante)" });
    return false;
  }

  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).set("WWW-Authenticate", "Bearer").json({ message: "Token richiesto" });
    return false;
  }

  const providedToken = authHeader.substring(7).trim();
  if (!timingSafeCompare(providedToken, expectedToken)) {
    res.status(401).json({ message: "Token non valido" });
    return false;
  }

  return true;
}

router.get("/tasks-export", (req: Request, res: Response) => {
  if (!requireExportToken(req, res)) return;

  const part = typeof req.query.part === "string" ? req.query.part : null;

  let filePath: string;
  if (part) {
    const sanitized = part.replace(/[^0-9]/g, "").padStart(2, "0");
    filePath = path.join(EXPORTS_DIR, `bikerlink-tasks-part-${sanitized}.md`);
  } else {
    filePath = path.join(EXPORTS_DIR, "bikerlink-tasks.md");
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      message: "Export non trovato. Rigenera exports/bikerlink-tasks.md eseguendo lo script.",
      requestedFile: path.basename(filePath),
    });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Export-File", path.basename(filePath));
  return res.send(content);
});

export default router;
