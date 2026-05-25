import { Router } from "express";
import configRouter from "./config-handler";
import rolloutRouter from "./rollout-handler";
import testerRouter from "./tester-handler";
import testRoutingRouter from "./test-handler";
import providersRouter from "./providers-handler";

const router = Router();

router.use("/", configRouter);
router.use("/", rolloutRouter);
router.use("/", testerRouter);
router.use("/", testRoutingRouter);
router.use("/", providersRouter);

export default router;
