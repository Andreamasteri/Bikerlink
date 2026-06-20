import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { db, withDbRetry } from "../db";
import { diagnosticReports, diagnosticQueue, users, notifications } from "@shared/db";
import { sendError } from "../lib/api-response";
import { and, eq, gt, isNull } from "drizzle-orm";

const router = Router();

const REPORTS_DIR = path.join(process.cwd(), "server", "diagnostics", "reports");

function ensureReportsDir() {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  } catch {
    // noop: dir may already exist
  }
}

function writeReportFile(reportId: string, userId: string, body: Record<string, unknown>): void {
  try {
    ensureReportsDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `diag_${userId}_${ts}_${reportId.slice(0, 8)}.json`;
    const filepath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify({ id: reportId, userId, ...body }, null, 2), "utf8");
  } catch (e) {
    console.warn("[diagnostic/report] File write error:", e);
  }
}

router.post("/report", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const {
      triggeredBy = "user",
      appVersion,
      platform,
      deviceModel,
      buildProfile,
      sentryEventId,
      summary,
      results,
    } = req.body as {
      triggeredBy?: string;
      appVersion?: string;
      platform?: string;
      deviceModel?: string;
      buildProfile?: string;
      sentryEventId?: string;
      summary?: unknown;
      results?: unknown;
    };

    const allowed = ["auto", "admin", "remote", "user"];
    const safeTriggeredBy = allowed.includes(triggeredBy) ? triggeredBy : "user";

    const [report] = await db.insert(diagnosticReports).values({
      userId: req.session.userId,
      triggeredBy: safeTriggeredBy,
      appVersion: appVersion ? String(appVersion).substring(0, 50) : null,
      platform: platform ? String(platform).substring(0, 20) : null,
      deviceModel: deviceModel ? String(deviceModel).substring(0, 100) : null,
      buildProfile: buildProfile ? String(buildProfile).substring(0, 20) : null,
      sentryEventId: sentryEventId ? String(sentryEventId).substring(0, 100) : null,
      summary: summary as Record<string, unknown> ?? null,
      results: results as Record<string, unknown>[] ?? null,
    }).returning({ id: diagnosticReports.id });

    if (safeTriggeredBy === "remote") {
      try {
        await db.update(diagnosticQueue)
          .set({ executedAt: new Date() })
          .where(
            and(
              eq(diagnosticQueue.userId, req.session.userId),
              isNull(diagnosticQueue.executedAt),
              gt(diagnosticQueue.expiresAt, new Date()),
            )
          );
      } catch {
        // best-effort: don't fail the report save
      }
    }

    const reportId = report?.id ?? "unknown";

    // Fire-and-forget: save to file
    setImmediate(() => {
      writeReportFile(reportId, req.session.userId!, {
        triggeredBy: safeTriggeredBy,
        appVersion,
        platform,
        deviceModel,
        sentryEventId,
        summary,
        results,
        runAt: new Date().toISOString(),
      });
    });

    // Fire-and-forget: send email to admin
    setImmediate(() => {
      import("../email/notifications").then(({ sendDiagnosticReportEmail }) => {
        sendDiagnosticReportEmail({
          reportId,
          userId: req.session.userId!,
          appVersion: appVersion ? String(appVersion) : "?",
          platform: platform ? String(platform) : "?",
          deviceModel: deviceModel ? String(deviceModel) : "?",
          triggeredBy: safeTriggeredBy,
          summary: summary as Record<string, number> | undefined,
        }).catch((e: unknown) => {
          console.warn("[diagnostic/report] Email error:", e);
        });
      }).catch(() => {});
    });

    // Fire-and-forget: in-app notification to all admin users.
    setImmediate(async () => {
      try {
        const s = summary as Record<string, number> | undefined;
        const passed = s?.passed ?? 0;
        const failed = s?.failed ?? 0;
        const warned = s?.warned ?? 0;
        const icon = failed > 0 ? "❌" : warned > 0 ? "⚠️" : "✅";
        let nickname = "Sconosciuto";
        try {
          const [row] = await db
            .select({ nickname: users.nickname })
            .from(users)
            .where(eq(users.id, req.session.userId!))
            .limit(1);
          if (row?.nickname) nickname = row.nickname;
        } catch { /* best-effort */ }
        const adminUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "admin"));
        if (adminUsers.length > 0) {
          await db.insert(notifications).values(
            adminUsers.map(a => ({
              userId: a.id,
              title: `${icon} Report diagnostico`,
              body: `Da ${nickname} — ${passed} OK · ${warned} avvisi · ${failed} errori`,
              notificationType: "diagnostic_report",
              referenceType: "diagnostic_report",
              referenceId: reportId,
            }))
          );
        }
      } catch (e) {
        console.warn("[diagnostic/report] In-app notification error:", e);
      }
    });

    // Fire-and-forget: push notification to admins for EVERY report.
    const userId = req.session.userId;
    setImmediate(async () => {
      try {
        const s = summary as Record<string, number> | undefined;
        const passed = s?.passed ?? 0;
        const failed = s?.failed ?? 0;
        const warned = s?.warned ?? 0;
        let nickname = "Sconosciuto";
        try {
          const [row] = await db
            .select({ nickname: users.nickname })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (row?.nickname) nickname = row.nickname;
        } catch {
          // best-effort: keep fallback nickname
        }
        const { sendSystemAlertPushToAdmins } = await import("../push-notifications");
        await sendSystemAlertPushToAdmins(
          "📋 Report diagnostico",
          `Report diagnostico da ${nickname} — ${passed} OK · ${failed} errori · ${warned} avvisi`,
          { type: "diagnostic_report", reportId },
        );
      } catch (e) {
        console.warn("[diagnostic/report] Push error:", e);
      }
    });

    return res.json({ id: reportId, ok: true });
  } catch (err) {
    console.error("[diagnostic/report] POST error:", err);
    return sendError(res, 500, "Errore salvataggio report");
  }
});

router.get("/pending", async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return sendError(res, 401, "Non autenticato");
    }
    const userId = req.session.userId;
    const rows = await withDbRetry(() => db.select({ id: diagnosticQueue.id })
      .from(diagnosticQueue)
      .where(
        and(
          eq(diagnosticQueue.userId, userId),
          isNull(diagnosticQueue.executedAt),
          gt(diagnosticQueue.expiresAt, new Date()),
        )
      )
      .limit(1));

    return res.json({ pending: rows.length > 0 });
  } catch (err) {
    console.error("[diagnostic/pending] GET error:", err);
    return sendError(res, 500, "Errore verifica comando");
  }
});

export default router;
