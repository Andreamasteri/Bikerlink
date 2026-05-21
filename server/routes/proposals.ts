import { Router } from "express";
import crudRouter from "./proposals/crud";
import participantsRouter from "./proposals/participants";
import matchingRouter from "./proposals/matching";

const router = Router();

router.use("/", crudRouter);
router.use("/", participantsRouter);
router.use("/", matchingRouter);


export default router;
