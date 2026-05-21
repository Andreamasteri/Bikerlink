import { Router } from "express";
import discoveryRoutes from "./motoclubs/discovery";
import membersRoutes from "./motoclubs/members";
import requestsRoutes from "./motoclubs/requests";
import managementRoutes from "./motoclubs/management";
import marketplaceRoutes from "./motoclubs/marketplace";
import syncRoutes from "./motoclubs/sync";
import { seedMotoclubs } from "./motoclubs/seed";

const router = Router();

// Mount sub-routers
router.use("/", discoveryRoutes);
router.use("/", membersRoutes);
router.use("/", requestsRoutes);
router.use("/", managementRoutes);
router.use("/", marketplaceRoutes);
router.use("/", syncRoutes);

export { seedMotoclubs };
export { createRegionalClubInvite, createClubInvitesForMoto } from "./motoclubs/utils";
export default router;
