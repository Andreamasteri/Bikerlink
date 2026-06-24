import { Router } from "express";
import { getBootLog, getBootSummary } from "../../lib/boot-log";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    summary: getBootSummary(),
    entries: getBootLog(),
  });
});

export default router;
