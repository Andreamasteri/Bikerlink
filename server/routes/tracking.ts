import { Router } from "express";
import sessionsRouter from "./tracking/sessions";
import waypointsRouter from "./tracking/waypoints";
import statsRouter from "./tracking/stats";
import historyRouter from "./tracking/history";

const router = Router();

// Mount sub-routers
router.use("/", sessionsRouter);
router.use("/", waypointsRouter);
router.use("/", statsRouter);
router.use("/", historyRouter);

export default router;
