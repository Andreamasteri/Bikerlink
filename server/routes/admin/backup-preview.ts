import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { sendError } from "../../lib/api-response";

const router = Router();

const BACKUP_DIR = path.join(process.cwd(), "server", "data", "backup");

const KNOWN_TABLES: { file: string; label: string }[] = [
  { file: "users.json", label: "utenti" },
  { file: "motoclubs.json", label: "motoclubs" },
  { file: "eventi.json", label: "eventi" },
];

function readBackupFile(filename: string): unknown[] {
  const filepath = path.join(BACKUP_DIR, filename);
  try {
    if (!fs.existsSync(filepath)) return [];
    const raw = fs.readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => !(r as Record<string, unknown>)["_example"]);
  } catch {
    return [];
  }
}

router.get("/backup-preview", (_req: Request, res: Response) => {
  try {
    const summary: { table: string; label: string; count: number }[] = [];
    const records: Record<string, unknown[]> = {};

    for (const { file, label } of KNOWN_TABLES) {
      const data = readBackupFile(file);
      const table = file.replace(".json", "");
      summary.push({ table, label, count: data.length });
      records[table] = data;
    }

    return res.json({ summary, records });
  } catch (_err) {
    return sendError(res, 500, "Errore lettura backup");
  }
});

export default router;
