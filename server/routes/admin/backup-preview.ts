import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * This endpoint used to expose static JSON fixtures, including a field labelled
 * as a plaintext password. Those files were not a real database backup and must
 * never be presented as recoverable user data.
 */
router.get("/backup-preview", (_req: Request, res: Response) => {
  return res.status(410).json({
    code: "BACKUP_PREVIEW_DISABLED",
    message: "L'anteprima JSON statica è stata disabilitata. I backup reali sono privati e non espongono credenziali.",
  });
});

export default router;
