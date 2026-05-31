import { Router } from "express";
import crudRouter from "./planned-routes/crud";
import waypointsRouter from "./planned-routes/waypoints";
import { poiExtraRouter } from "./planned-routes/waypoints.next";
import sharingRouter from "./planned-routes/sharing";
import extrasRouter from "./planned-routes/extras";
import matchingIntegrationRouter from "./planned-routes/matching-integration";

const router = Router();

// Mount sub-routers
// CRUD operations (/, /:id)
router.use("/", crudRouter);

// Waypoint management, AI, routing, weather, POI
router.use("/", waypointsRouter);

// POI extra routes (poi-photo, poi-search) — companion di waypoints.ts
router.use("/", poiExtraRouter);

// Sharing, GPX import/export, compatible bikers
router.use("/", sharingRouter);

// Elevation, multiday, style profile, hotels
router.use("/", extrasRouter);

// Task #2528 — integrazione matching ↔ planned routes
router.use("/", matchingIntegrationRouter);

// Export fallbackAiParse as it might be used elsewhere (though not in routes typically)
export { fallbackAiParse } from "./planned-routes/utils";

export default router;
