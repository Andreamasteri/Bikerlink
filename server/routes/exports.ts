import type { Express } from "express";
import { registerMatchingPdfRoutes } from "./matching-pdf";

export function registerExportsRoutes(app: Express) {
  registerMatchingPdfRoutes(app);
}
