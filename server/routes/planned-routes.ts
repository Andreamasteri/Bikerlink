import { Router } from "express";
import crudRouter from "./planned-routes/crud";
import waypointsRouter from "./planned-routes/waypoints";
import sharingRouter from "./planned-routes/sharing";
import extrasRouter from "./planned-routes/extras";

const router = Router();

// Mount sub-routers
// CRUD operations (/, /:id)
router.use("/", crudRouter);

// Waypoint management, AI, routing, weather, POI
router.use("/", waypointsRouter);

// Sharing, GPX import/export, compatible bikers
router.use("/", sharingRouter);

// Elevation, multiday, style profile, hotels
router.use("/", extrasRouter);

// Export fallbackAiParse as it might be used elsewhere (though not in routes typically)
export { fallbackAiParse } from "./planned-routes/utils";

export default router;
