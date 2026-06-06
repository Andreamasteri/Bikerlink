import { Router } from "express";
import configRouter from "./config-handler";
import rolloutRouter from "./rollout-handler";
import testerRouter from "./tester-handler";
import testRoutingRouter from "./test-handler";
import providersRouter from "./providers-handler";
import tileProxyRouter from "./tile-proxy-handler";
import valhallaBenchRouter from "./valhalla-bench";

const router = Router();

router.use("/", configRouter);
router.use("/", rolloutRouter);
router.use("/", testerRouter);
router.use("/", testRoutingRouter);
router.use("/", providersRouter);
router.use("/", tileProxyRouter);
router.use("/", valhallaBenchRouter);

export default router;
