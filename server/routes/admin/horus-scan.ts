/**
 * Task #86 — Endpoint admin per le due scansioni complete on-demand di Horus.
 *
 * Montato sotto /api/admin/horus-scan (vedi admin.ts). È il secondo punto di
 * trigger (oltre alla chat): un comando/azione dal pannello admin. Espone:
 *   GET  /status  → stato di avanzamento delle due scansioni + ultimo esito
 *                   analisi + info manuale (per il controllo avanzamento/risultati)
 *   POST /start   → { mode: "analysis" | "manual" } avvia la scansione richiesta
 *   POST /push    → { target: "bowie" | "horus" } push manuale → modello Ollama su TC
 *
 * NESSUN avvio automatico: le scansioni partono solo da questi trigger espliciti.
 * Horus resta in sola lettura.
 */
import path from "path";
import { spawn } from "child_process";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { sendError, sendSuccess } from "../../lib/api-response";
import { db } from "../../db";
import { aiAnalysisRuns, aiAnalysisArtifacts } from "@shared/db";
import { startHorusScan, getAllHorusScanStatus } from "../../ai/assistant/horus-scanner";
import { getNadirManual, getNadirManualPrevious } from "../../ai/nadir/manual";

const router = Router();

const ROOT = path.resolve(import.meta.dirname, "../../..");

const startSchema = z.object({
  mode: z.enum(["analysis", "manual"]),
});

const pushSchema = z.object({
  target: z.enum(["bowie", "horus"]).default("bowie"),
});

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const scans = getAllHorusScanStatus();

    // Ultimo esito dell'analisi codice+DB (trigger repo-study, persona horus).
    const [lastRun] = await db
      .select({
        id: aiAnalysisRuns.id,
        createdAt: aiAnalysisRuns.createdAt,
        status: aiAnalysisRuns.status,
        summary: aiAnalysisRuns.summary,
        modelId: aiAnalysisRuns.modelId,
      })
      .from(aiAnalysisRuns)
      .where(eq(aiAnalysisRuns.trigger, "repo-study"))
      .orderBy(desc(aiAnalysisRuns.createdAt))
      .limit(1);

    let lastAnalysis: {
      id: string;
      createdAt: Date;
      status: string;
      summary: string | null;
      modelId: string | null;
      proposals: string | null;
    } | null = null;
    if (lastRun) {
      const [proposalArtifact] = await db
        .select({ content: aiAnalysisArtifacts.content })
        .from(aiAnalysisArtifacts)
        .where(eq(aiAnalysisArtifacts.runId, lastRun.id))
        .orderBy(desc(aiAnalysisArtifacts.createdAt))
        .limit(1);
      lastAnalysis = { ...lastRun, proposals: proposalArtifact?.content ?? null };
    }

    const [manual, manualPrev] = await Promise.all([getNadirManual(), getNadirManualPrevious()]);

    return sendSuccess(res, {
      scans,
      lastAnalysis,
      manual: {
        length: manual.length,
        hasPrevious: !!manualPrev,
        previousSavedAt: manualPrev?.savedAt ?? null,
        // Il testo completo del manuale è leggibile da GET /api/admin/nadir/manual.
      },
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore lettura stato scansioni Horus");
  }
});

router.post("/start", async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Parametro 'mode' non valido (analysis|manual)");
  }
  try {
    const result = await startHorusScan(parsed.data.mode);
    console.info(
      `[admin/horus-scan] start mode=${parsed.data.mode} started=${result.started} reason=${result.reason ?? "-"}`,
    );
    return sendSuccess(res, {
      started: result.started,
      reason: result.reason ?? null,
      status: result.status,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message ?? "Errore avvio scansione Horus");
  }
});

/**
 * Task #614 — POST /push
 *
 * Avvia `npx tsx scripts/ollama-push-manual.ts` (Bowie) o con `--target horus`
 * (Horus, disponibile dopo il Task #610) leggendo il manuale da
 * logs/nadir-manual-latest.md (mirror del manuale generato dall'ultima scan).
 *
 * Timeout: 150 s (push Ollama può impiegare fino a 120 s per ricreazione modello).
 * La risposta torna SOLO a completamento/errore — il client non deve polla.
 */
router.post("/push", async (req: Request, res: Response) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "Parametro 'target' non valido (bowie|horus)");
  }
  const { target } = parsed.data;
  const qaFile = "logs/nadir-manual-latest.md";
  const scriptPath = path.join(ROOT, "scripts", "ollama-push-manual.ts");

  // Argomenti per lo script — target horus richiede Task #610 (già in merge).
  const args = ["tsx", scriptPath, "--qa-file", qaFile];
  if (target === "horus") args.push("--target", "horus");

  console.info(`[admin/horus-scan] push target=${target} qaFile=${qaFile}`);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const TIMEOUT_MS = 150_000;

  return new Promise<void>((resolve) => {
    let settled = false;
    const done = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      if (ok) {
        resolve(sendSuccess(res, { target, output: detail }));
      } else {
        resolve(sendError(res, 502, detail));
      }
    };

    const child = spawn("npx", args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      done(false, `Push ${target}: timeout dopo ${TIMEOUT_MS / 1000}s`);
    }, TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      const out = [...stdout, ...stderr].join("").trim();
      if (code === 0) {
        done(true, out.slice(-2000)); // ultimi 2 kB dell'output per il pannello
      } else {
        // Estrai la riga ❌ dall'output per un messaggio comprensibile
        const errLine =
          out
            .split("\n")
            .reverse()
            .find((l) => l.includes("❌") || l.toLowerCase().includes("errore") || l.toLowerCase().includes("error"))
            ?.trim() ?? out.slice(-500).trim();
        done(false, errLine || `Push ${target} fallito (exit ${code ?? "?"})`);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      done(false, `Errore avvio script push: ${err.message}`);
    });
  });
});

export default router;
