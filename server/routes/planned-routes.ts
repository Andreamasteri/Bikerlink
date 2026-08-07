import { Router } from "express";
import crudRouter from "./planned-routes/crud";
import waypointsRouter from "./planned-routes/waypoints";
import { poiExtraRouter } from "./planned-routes/waypoints.next";
import sharingRouter from "./planned-routes/sharing";
import sharingNextRouter from "./planned-routes/sharing.next";
import extrasRouter from "./planned-routes/extras";
import matchingIntegrationRouter from "./planned-routes/matching-integration";
import liveRouter from "./planned-routes/live";

const router = Router();

// Mount sub-routers — named routes FIRST, wildcard CRUD (/:id) LAST
// Waypoint management, AI, routing, weather, POI, geocode
router.use("/", waypointsRouter);

// POI extra routes (poi-photo, poi-search) — companion di waypoints.ts
router.use("/", poiExtraRouter);

// Sharing, GPX import/export, compatible bikers
router.use("/", sharingRouter);

// KML export (Google Maps compatible)
router.use("/", sharingNextRouter);

// Elevation, multiday, style profile, hotels
router.use("/", extrasRouter);

// integrazione matching ↔ planned routes
router.use("/", matchingIntegrationRouter);
router.use("/", liveRouter);

// CRUD operations (/, /:id) — MUST be last: GET /:id wildcard intercepts all unmatched GET paths
router.use("/", crudRouter);

// Export fallbackAiParse as it might be used elsewhere (though not in routes typically)
export { fallbackAiParse } from "./planned-routes/utils";

export default router;
