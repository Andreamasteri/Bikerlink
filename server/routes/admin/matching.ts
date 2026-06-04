// Task #2603 — barrel (mechanical split).
// Original handlers are extracted into ./matching/*.ts sub-routers.
// The adminMatchingRateLimiter middleware MUST remain applied BEFORE any
// sub-router mounting so it covers all admin matching endpoints identically.
import { Router } from "express";
import { adminMatchingRateLimiter } from "../../lib/rate-limiters";
import diagnosticsRouter from "./matching/diagnostics";
import diagnosticsNextRouter from "./matching/diagnostics.next";
import actionsRouter from "./matching/actions";
import observabilityRouter from "./matching/observability";
import debugRouter from "./matching/debug";
import explainRouter from "./matching/explain";
import notificationsRouter from "./matching/notifications";
import rulesRouter from "./matching/rules";

const router = Router();

// Apply rate limiter to ALL admin matching routes (Task #2509).
router.use(adminMatchingRateLimiter);

router.use(diagnosticsRouter);
router.use(diagnosticsNextRouter);
router.use(actionsRouter);
router.use(observabilityRouter);
router.use(debugRouter);
router.use(explainRouter);
router.use(notificationsRouter);
router.use(rulesRouter);

export default router;
