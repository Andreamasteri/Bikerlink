import { Router } from "express";
import authRouter from "./lastfm/auth";
import tracksRouter from "./lastfm/tracks";
import playlistsRouter from "./lastfm/playlists";

const router = Router();

router.use("/", authRouter);
router.use("/tracks", tracksRouter);
router.use("/", playlistsRouter);

export default router;
