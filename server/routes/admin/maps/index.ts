import { Router } from "express";
import configRouter from "./config-handler";
import rolloutRouter from "./rollout-handler";
import testerRouter from "./tester-handler";
import testRoutingRouter from "./test-handler";

const router = Router();

router.use("/", configRouter);
router.use("/", rolloutRouter);
router.use("/", testerRouter);
router.use("/", testRoutingRouter);

export default router;
