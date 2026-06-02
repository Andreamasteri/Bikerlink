import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import {
  runExport,
  getExportStatus,
  getExportProgress,
  getExportHistory,
  listExportFiles,
  downloadExport,
  setExportSchedule,
  startExportScheduler,
  stopExportScheduler,
  type ExportSchedule,
} from "../../export-service";

const router = Router();

router.get("/exports/status", async (_req: Request, res: Response) => {
  try {
    const status = await getExportStatus();
    return res.json(status);
  } catch (err) {
    console.error("[admin/exports] status error:", err);
    return sendError(res, 500, "Errore stato export");
  }
});

router.get("/exports/progress", (_req: Request, res: Response) => {
  try {
    return res.json(getExportProgress());
  } catch (err) {
    console.error("[admin/exports] progress error:", err);
    return sendError(res, 500, "Errore progresso export");
  }
});

router.get("/exports/history", async (_req: Request, res: Response) => {
  try {
    const history = await getExportHistory();
    return res.json({ history });
  } catch (err) {
    console.error("[admin/exports] history error:", err);
    return sendError(res, 500, "Errore storico export");
  }
});

router.get("/exports/list", async (_req: Request, res: Response) => {
  try {
    const files = await listExportFiles();
    return res.json({ files });
  } catch (err) {
    console.error("[admin/exports] list error:", err);
    return sendError(res, 500, "Errore lista export");
  }
});

router.post("/exports/run", async (req: Request, res: Response) => {
  try {
    const { excludeFake = true, tables } = req.body as {
      excludeFake?: boolean;
      tables?: string[];
    };

    const meta = await runExport({ excludeFake, tables });
    return res.json({ ok: true, export: meta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore export";
    console.error("[admin/exports] run error:", err);
    return sendError(res, 500, msg);
  }
});

router.put("/exports/schedule", async (req: Request, res: Response) => {
  try {
    const { schedule } = req.body as { schedule?: string };
    if (!schedule || !["off", "daily", "weekly"].includes(schedule)) {
      return sendError(res, 400, "schedule deve essere: off, daily, weekly");
    }
    await setExportSchedule(schedule as ExportSchedule);
    if (schedule === "off") {
      stopExportScheduler();
    } else {
      await startExportScheduler();
    }
    const status = await getExportStatus();
    return res.json({ ok: true, ...status });
  } catch (err) {
    console.error("[admin/exports] schedule error:", err);
    return sendError(res, 500, "Errore impostazione schedule");
  }
});

router.get("/exports/download/:filename", async (req: Request, res: Response) => {
  try {
    const filename = typeof req.params.filename === "string" ? req.params.filename : "";
    if (!filename || !/^bikerlink_export_[\w-]+\.zip$/.test(filename)) {
      return sendError(res, 400, "Nome file non valido");
    }
    const buffer = await downloadExport(filename);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (err) {
    console.error("[admin/exports] download error:", err);
    return sendError(res, 404, "File non trovato");
  }
});

export default router;
