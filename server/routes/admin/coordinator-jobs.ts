// Task #10 (Quebracho c) — Admin panel: registry dei job del coordinatore
// Quebracho + kill-switch globale. Espone in lettura lo snapshot mantenuto da
// job-registry.ts/job-gate.ts (Task #5/#9) e consente all'admin di applicare
// direttive manuali (pause/resume/force/throttle), sempre rispettate dal gate
// indipendentemente dalla raggiungibilità di Quebracho.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
import {
  getCoordinatorJobsSnapshot,
  getCoordinatorHealthSummary,
  isCoordinatorKillSwitchActive,
  setCoordinatorKillSwitch,
  isQuebrachoUnreachable,
  applyJobDirective,
} from "../../ai/coordinator/job-gate";

const router = Router();

router.get("/coordinator/jobs", async (_req: Request, res: Response) => {
  try {
    const [killSwitch, quebrachoDown] = await Promise.all([
      isCoordinatorKillSwitchActive(),
      isQuebrachoUnreachable(),
    ]);
    res.json({
      killSwitch,
      quebrachoReachable: !quebrachoDown,
      summary: getCoordinatorHealthSummary(),
      jobs: getCoordinatorJobsSnapshot(),
    });
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

const DirectiveBody = z.object({
  kind: z.enum(["pause", "resume", "force", "throttle"]),
  reason: z.string().min(1).max(500).optional(),
  throttleMs: z.number().int().positive().max(24 * 60 * 60_000).optional(),
});

router.post("/coordinator/jobs/:name/directive", async (req: Request, res: Response) => {
  const name = String(req.params.name || "").trim();
  if (!name) { sendError(res, 400, "Nome job mancante"); return; }
  const parsed = DirectiveBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  try {
    // Le direttive dell'admin sono SEMPRE issuedBy="admin_manual": rispettate dal
    // gate anche quando Quebracho è irraggiungibile (vedi job-gate.ts canRunJob).
    const result = await applyJobDirective(
      name,
      parsed.data.kind,
      { reason: parsed.data.reason, throttleMs: parsed.data.throttleMs },
      "admin_manual",
    );
    res.json(result);
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

const KillSwitchBody = z.object({ active: z.boolean() });

router.post("/coordinator/kill-switch", async (req: Request, res: Response) => {
  const parsed = KillSwitchBody.safeParse(req.body ?? {});
  if (!parsed.success) { sendError(res, 400, parsed.error.issues[0].message); return; }
  try {
    await setCoordinatorKillSwitch(parsed.data.active);
    res.json({ active: parsed.data.active });
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

export default router;
