import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { pool } from "../../db";
import { storage } from "../../storage";
import {
  isVacuumRunning,
  runVacuumFullAll,
  VACUUM_LAST_RUN_SETTING_KEY,
  VACUUM_DETAIL_SETTING_KEY,
  VACUUM_TABLES,
} from "../../vacuum-service";

const router = Router();

interface TableDbConfig {
  name: string;
  label: string;
  labelCol?: string;
  emailCol?: string;
  roleCol?: string;
  statusCol?: string;
  conversationTypeCol?: string;
  messageTypeCol?: string;
  clubTypeCol?: string;
  isApprovedCol?: string;
  isActiveCol?: string;
  userIdCol?: string;
  modelCol?: string;
  targetTypeCol?: string;
  notificationTypeCol?: string;
  ticketTypeCol?: string;
  createdAtCol?: string;
}

const TABLE_CONFIGS: TableDbConfig[] = [
  { name: "users", label: "Utenti", emailCol: "email", roleCol: "role", statusCol: "status", createdAtCol: "created_at" },
  { name: "user_profiles", label: "Profili utente", userIdCol: "user_id", createdAtCol: "created_at" },
  { name: "conversations", label: "Conversazioni", conversationTypeCol: "conversation_type", statusCol: "status", createdAtCol: "created_at" },
  { name: "messages", label: "Messaggi", messageTypeCol: "message_type", userIdCol: "user_id", createdAtCol: "created_at" },
  { name: "moto_clubs", label: "MotoClub", labelCol: "name", clubTypeCol: "club_type", isApprovedCol: "is_approved", createdAtCol: "created_at" },
  { name: "moto_club_members", label: "Membri MotoClub", clubTypeCol: undefined, userIdCol: "user_id", isActiveCol: undefined, statusCol: "status", createdAtCol: "created_at" },
  { name: "proposals", label: "Proposte", statusCol: "status", createdAtCol: "created_at" },
  { name: "notifications", label: "Notifiche", notificationTypeCol: "notification_type", userIdCol: "user_id", targetTypeCol: "target_type", createdAtCol: "created_at" },
  { name: "feedback_tickets", label: "Ticket feedback", ticketTypeCol: "ticket_type", statusCol: "status", createdAtCol: "created_at" },
  { name: "user_motorcycles", label: "Moto utenti", userIdCol: "user_id", modelCol: "model", createdAtCol: "created_at" },
  { name: "biker_biker_matches", label: "Match B-B", statusCol: "status", createdAtCol: "created_at" },
  { name: "biker_zavorrina_matches", label: "Match B-Z", statusCol: "status", createdAtCol: "created_at" },
  { name: "invitation_codes", label: "Codici invito", isActiveCol: "is_active", createdAtCol: "created_at" },
];

function buildSelectCols(cfg: TableDbConfig): string {
  const cols: string[] = ["id"];
  const createdAt = cfg.createdAtCol ?? "created_at";
  cols.push(`${createdAt} AS "createdAt"`);
  if (cfg.labelCol) cols.push(`${cfg.labelCol} AS "label"`);
  if (cfg.emailCol) cols.push(`${cfg.emailCol} AS "email"`);
  if (cfg.roleCol) cols.push(`${cfg.roleCol} AS "role"`);
  if (cfg.statusCol) cols.push(`${cfg.statusCol} AS "status"`);
  if (cfg.conversationTypeCol) cols.push(`${cfg.conversationTypeCol} AS "conversationType"`);
  if (cfg.messageTypeCol) cols.push(`${cfg.messageTypeCol} AS "messageType"`);
  if (cfg.clubTypeCol) cols.push(`${cfg.clubTypeCol} AS "clubType"`);
  if (cfg.isApprovedCol) cols.push(`${cfg.isApprovedCol} AS "isApproved"`);
  if (cfg.isActiveCol) cols.push(`${cfg.isActiveCol} AS "isActive"`);
  if (cfg.userIdCol) cols.push(`${cfg.userIdCol} AS "userId"`);
  if (cfg.modelCol) cols.push(`${cfg.modelCol} AS "model"`);
  if (cfg.targetTypeCol) cols.push(`${cfg.targetTypeCol} AS "targetType"`);
  if (cfg.notificationTypeCol) cols.push(`${cfg.notificationTypeCol} AS "notificationType"`);
  if (cfg.ticketTypeCol) cols.push(`${cfg.ticketTypeCol} AS "ticketType"`);
  return cols.join(", ");
}

async function tableExists(client: import("pg").PoolClient, tableName: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return res.rows[0]?.exists === true;
}

router.get("/db-stats", async (_req: Request, res: Response) => {
  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    const tables = [];

    for (const cfg of TABLE_CONFIGS) {
      const exists = await tableExists(client, cfg.name);
      if (!exists) continue;

      const createdAt = cfg.createdAtCol ?? "created_at";
      const selectCols = buildSelectCols(cfg);

      let total = 0;
      let recent: Record<string, unknown>[] = [];

      try {
        const countRes = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM "${cfg.name}"`,
        );
        total = parseInt(countRes.rows[0]?.count ?? "0", 10);
      } catch {
        total = 0;
      }

      try {
        const recentRes = await client.query(
          `SELECT ${selectCols} FROM "${cfg.name}" ORDER BY ${createdAt} DESC NULLS LAST LIMIT 5`,
        );
        recent = recentRes.rows;
      } catch {
        recent = [];
      }

      tables.push({ name: cfg.name, label: cfg.label, total, recent });
    }

    return res.json({ tables });
  } catch (err) {
    console.error("[admin/db-stats] error:", err);
    return sendError(res, 500, "Errore lettura statistiche DB");
  } finally {
    if (client) client.release();
  }
});

router.get("/db/table-sizes", async (_req: Request, res: Response) => {
  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();

    const tableNames = [...VACUUM_TABLES];
    const tables: { name: string; sizeBytes: number; totalSizeBytes: number }[] = [];

    for (const table of tableNames) {
      try {
        const res2 = await client.query<{ relation_size: string; total_size: string }>(
          `SELECT pg_relation_size($1::regclass) AS relation_size,
                  pg_total_relation_size($1::regclass) AS total_size`,
          [table],
        );
        const row = res2.rows[0];
        tables.push({
          name: table,
          sizeBytes: parseInt(row?.relation_size ?? "0", 10),
          totalSizeBytes: parseInt(row?.total_size ?? "0", 10),
        });
      } catch {
        tables.push({ name: table, sizeBytes: 0, totalSizeBytes: 0 });
      }
    }

    const isRunning = isVacuumRunning();

    let lastVacuum: string | null = null;
    try {
      const setting = await storage.getAppSetting(VACUUM_LAST_RUN_SETTING_KEY);
      lastVacuum = setting?.value ?? null;
    } catch {
      lastVacuum = null;
    }

    let lastVacuumDetail: unknown = null;
    try {
      const detailSetting = await storage.getAppSetting(VACUUM_DETAIL_SETTING_KEY);
      if (detailSetting?.value) {
        lastVacuumDetail = JSON.parse(detailSetting.value);
      }
    } catch {
      lastVacuumDetail = null;
    }

    return res.json({ tables, isRunning, lastVacuum, lastVacuumDetail });
  } catch (err) {
    console.error("[admin/db/table-sizes] error:", err);
    return sendError(res, 500, "Errore lettura dimensioni tabelle");
  } finally {
    if (client) client.release();
  }
});

router.post("/db/vacuum-full", async (_req: Request, res: Response) => {
  try {
    if (isVacuumRunning()) {
      return sendError(res, 409, "VACUUM già in corso");
    }
    runVacuumFullAll().catch((err: unknown) => {
      console.error("[admin/db/vacuum-full] background error:", err);
    });
    return res.json({ ok: true, message: "VACUUM FULL avviato in background" });
  } catch (err) {
    console.error("[admin/db/vacuum-full] error:", err);
    return sendError(res, 500, "Errore avvio VACUUM FULL");
  }
});

export default router;
