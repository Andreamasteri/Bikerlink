import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/auth-middleware";
import { sendError } from "../lib/api-response";

const router = Router();

/**
 * GET /api/tags/categories         → elenco categorie tag
 * GET /api/tags?category=<slug>    → tag di una categoria
 * GET /api/tags                    → tutti i tag con categoria
 *
 * Endpoint pubblici (autenticati) per la UI utente. La gestione (create/delete)
 * resta in /api/admin/tags.
 */
router.get("/categories", requireAuth, async (_req: Request, res: Response) => {
  try {
    const cats = await storage.listTagCategories();
    return res.json(cats);
  } catch (err) {
    console.error("[tags] GET categories error:", err);
    return sendError(res, 500, "Errore lettura categorie tag");
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    if (category) {
      const tags = await storage.listTagsByCategorySlug(category);
      return res.json({ category, tags });
    }
    const all = await storage.listAllTagsWithCategory();
    return res.json({ tags: all });
  } catch (err) {
    console.error("[tags] GET list error:", err);
    return sendError(res, 500, "Errore lettura tag");
  }
});

export default router;
