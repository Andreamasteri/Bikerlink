import { Router } from "express";
import stationsRouter from "./radio/stations";
import playbackRouter from "./radio/playback";
import metadataRouter from "./radio/metadata";
import playlistsRouter from "./radio/playlists";

const router = Router();

router.use("/", stationsRouter);
router.use("/", playbackRouter);
router.use("/", metadataRouter);
router.use("/", playlistsRouter);

export default router;
