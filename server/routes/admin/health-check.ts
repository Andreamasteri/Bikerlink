// Task #4825 — Route admin per il Health Check "Scan".
// Endpoints (montati sotto /api/admin):
//   GET  /health-check/checkers   → metadata checker disponibili
//   GET  /health-check/ai-status  → stato live dei 4 provider AI
//   POST /health-check/run        → SSE: progress per-checker + report finale
//   GET  /health-check/latest     → ultimo report in memoria
//   GET  /health-check/history    → elenco report salvati su disco
//   POST /health-check/save-log   → salva report come JSON su server/diagnostics/reports/
//   POST /health-check/create-task→ crea un feedback ticket interno per un fix
//   POST /health-check/export     → scarica un report come JSON
import { Router, type Request, type Response } from "express";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { feedbackTickets } from "@shared/db";
import { getCheckerMeta, CHECKER_IDS } from "../../../scripts/health-check";
import { runHealthCheck } from "../../../scripts/health-check/runner";
import { analyzeReport, proposeFixes } from "../../../scripts/health-check/ai-analyze";
import type { AiProviderChoice, HealthCheckReport } from "../../../scripts/health-check/types";
import {
  getConfiguredProviders,
  getProviderHealth,
  getDailyUsage,
} from "../../ai/moderation/provider";
import { isOllamaReachable } from "../../lib/ollama-client";

const router = Router();

const REPORTS_DIR = join(process.cwd(), "server", "diagnostics", "reports");
const HC_PREFIX = "healthcheck_";

function ensureReportsDir(): void {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
}

let lastReport: HealthCheckReport | null = null;
let runInProgress = false;

const VALID_PROVIDERS: AiProviderChoice[] = ["ollama", "groq", "gemini", "openai"];

// ─────────────────────────── checkers metadata ───────────────────────────
router.get("/health-check/checkers", (_req: Request, res: Response) => {
  res.json({ checkers: getCheckerMeta() });
});

// ─────────────────────────── stato live provider AI ───────────────────────────
router.get("/health-check/ai-status", async (_req: Request, res: Response) => {
  try {
    const configured = new Set(getConfiguredProviders());
    const health = new Map(getProviderHealth().map((h) => [h.id, h]));
    const usage = new Map(getDailyUsage().map((u) => [u.id, u]));

    const ollamaUp = await isOllamaReachable();
    const cloud = (id: "groq" | "google" | "openai", label: string) => {
      const h = health.get(id);
      const u = usage.get(id);
      return {
        id: id === "google" ? "gemini" : id,
        label,
        configured: configured.has(id),
        available: configured.has(id) && Boolean(h?.available),
        detail: h?.lastError
          ? h.lastError.slice(0, 80)
          : u
            ? `${u.used}/${Number.isFinite(u.cap) ? u.cap : "∞"} oggi`
            : "",
      };
    };

    res.json({
      providers: [
        {
          id: "ollama",
          label: "Ollama",
          configured: Boolean(process.env.BOWIE_OLLAMA_URL?.trim()),
          available: ollamaUp,
          detail: process.env.BOWIE_OLLAMA_URL?.trim() ? (ollamaUp ? "self-hosted" : "offline") : "non configurato",
        },
        cloud("groq", "Groq"),
        cloud("google", "Gemini"),
        cloud("openai", "OpenAI"),
      ],
    });
  } catch (err) {
    return sendError(res, 500, (err as Error).message ?? "Errore stato AI");
  }
});

// ─────────────────────────── run (SSE progress) ───────────────────────────
function parseRunBody(body: unknown): {
  checkerIds: string[];
  mode: "analysis" | "fix";
  aiProvider: AiProviderChoice | null;
} {
  const b = (body ?? {}) as {
    checkerIds?: unknown;
    mode?: unknown;
    aiProvider?: unknown;
  };
  const ids = Array.isArray(b.checkerIds)
    ? b.checkerIds.filter((x): x is string => typeof x === "string" && CHECKER_IDS.includes(x))
    : CHECKER_IDS;
  const checkerIds = ids.length > 0 ? ids : CHECKER_IDS;
  const mode = b.mode === "fix" ? "fix" : "analysis";
  const aiProvider = VALID_PROVIDERS.includes(b.aiProvider as AiProviderChoice)
    ? (b.aiProvider as AiProviderChoice)
    : null;
  return { checkerIds, mode, aiProvider };
}

router.post("/health-check/run", async (req: Request, res: Response) => {
  if (runInProgress) {
    return sendError(res, 409, "Uno scan è già in corso — riprova tra poco");
  }
  const { checkerIds, mode, aiProvider } = parseRunBody(req.body);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  runInProgress = true;
  try {
    send("start", { checkerIds, mode, aiProvider });
    const report = await runHealthCheck({
      checkerIds,
      mode,
      aiProvider,
      onProgress: (checkerId, status, durationMs) =>
        send("progress", { checkerId, status, durationMs }),
    });

    const wantsAi = Boolean(aiProvider) || mode === "fix";
    report.aiAnalysisStatus = wantsAi ? "pending" : "skipped";

    // I risultati deterministici sono pronti: emettili SUBITO, l'AI segue async.
    send("scan-done", report);

    // Analisi AI (best-effort, non blocca il report deterministico).
    if (wantsAi) {
      send("ai-start", { provider: aiProvider });
      try {
        if (mode === "fix") {
          const fix = await proposeFixes(report);
          if (fix.provider !== "n/d") report.aiAnalysisProvider = fix.provider;
        }
        const ai = await analyzeReport(report);
        report.aiAnalysis = ai.markdown;
        report.aiAnalysisProvider = report.aiAnalysisProvider ?? ai.provider;
        report.aiAnalysisStatus = "done";
      } catch (err) {
        report.aiAnalysisStatus = "error";
        report.aiAnalysisError = (err as Error).message ?? "Errore analisi AI";
      }
    }

    lastReport = report;
    send("done", report);
  } catch (err) {
    send("error", { message: (err as Error).message ?? "Errore scan" });
  } finally {
    runInProgress = false;
    res.end();
  }
});

// ─────────────────────────── latest / history ───────────────────────────
router.get("/health-check/latest", (_req: Request, res: Response) => {
  res.json({ report: lastReport, inProgress: runInProgress });
});

router.get("/health-check/history", (_req: Request, res: Response) => {
  try {
    ensureReportsDir();
    const files = readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith(HC_PREFIX) && f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 30);
    const items = files.map((f) => {
      try {
        const r = JSON.parse(readFileSync(join(REPORTS_DIR, f), "utf-8")) as HealthCheckReport;
        return {
          file: f,
          runId: r.runId,
          runAt: r.runAt,
          summary: r.summary,
          mode: r.mode,
        };
      } catch {
        return { file: f, runId: f, runAt: "", summary: null, mode: "analysis" };
      }
    });
    res.json({ history: items });
  } catch (err) {
    return sendError(res, 500, (err as Error).message ?? "Errore history");
  }
});

// ─────────────────────────── save log su disco ───────────────────────────
router.post("/health-check/save-log", (req: Request, res: Response) => {
  const report = (req.body as { report?: HealthCheckReport })?.report ?? lastReport;
  if (!report) return sendError(res, 400, "Nessun report da salvare");
  try {
    ensureReportsDir();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `${HC_PREFIX}${stamp}_${report.runId}.json`;
    writeFileSync(join(REPORTS_DIR, filename), JSON.stringify(report, null, 2), "utf-8");
    res.json({ saved: true, filename });
  } catch (err) {
    return sendError(res, 500, (err as Error).message ?? "Errore salvataggio");
  }
});

// ─────────────────────────── crea task (feedback ticket interno) ───────────────────────────
router.post("/health-check/create-task", async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as {
    subject?: string;
    message?: string;
    items?: Array<{ subject: string; message: string }>;
  };
  try {
    const userId = (req.session as { userId?: string } | undefined)?.userId ?? null;
    const rows = Array.isArray(b.items) && b.items.length > 0
      ? b.items
      : b.subject && b.message
        ? [{ subject: b.subject, message: b.message }]
        : [];
    if (rows.length === 0) return sendError(res, 400, "Nessun task da creare");

    const values = rows.map((r) => ({
      userId,
      ticketType: "other" as const,
      subject: r.subject.slice(0, 200),
      message: r.message.slice(0, 8000),
      internalNote: "Health Check Scan (Task #4825)",
    }));
    await db.insert(feedbackTickets).values(values);
    res.json({ created: values.length });
  } catch (err) {
    return sendError(res, 500, (err as Error).message ?? "Errore creazione task");
  }
});

// ─────────────────────────── export JSON ───────────────────────────
router.post("/health-check/export", (req: Request, res: Response) => {
  const report = (req.body as { report?: HealthCheckReport })?.report ?? lastReport;
  if (!report) return sendError(res, 400, "Nessun report da esportare");
  const filename = `bikerlink-healthcheck-${report.runId}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(report, null, 2));
});

export default router;
