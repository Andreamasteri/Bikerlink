import { Router } from "express";
import crudRouter from "./proposals/crud";
import participantsRouter from "./proposals/participants";
import matchingRouter from "./proposals/matching";

const router = Router();

// matchingRouter prima: le sue rotte letterali (/matches, /proposal-profile-matches, …)
// devono vincere sul param /:id del crudRouter, altrimenti vengono catturate come ID.
router.use("/", matchingRouter);
router.use("/", participantsRouter);
router.use("/", crudRouter);


export default router;
