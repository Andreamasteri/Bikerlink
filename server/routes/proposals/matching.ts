// Task #2603 — estratto da server/routes/proposals/matching.ts (mechanical split)
import { Router } from "express";
import garageRouter from "./matching/garage";
import proposalRouter from "./matching/proposal";
import bikerRouter from "./matching/biker";
import routeAffinityRouter from "./matching/routeAffinity";
import miscRouter from "./matching/misc";

const router = Router();

router.use(garageRouter);
router.use(proposalRouter);
router.use(bikerRouter);
router.use(routeAffinityRouter);
router.use(miscRouter);

export default router;
