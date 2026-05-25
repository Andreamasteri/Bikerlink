import { Router } from "express";
import configRouter from "./config-handler";
import rolloutRouter from "./rollout-handler";
import testerRouter from "./tester-handler";

const router = Router();

router.use("/", configRouter);
router.use("/", rolloutRouter);
router.use("/", testerRouter);

export default router;
