import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { sendError } from "../../lib/api-response";

const router = Router();

const createTagSchema = z.object({
  categorySlug: z.string().min(1).max(50),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/, "Slug non valido (a-z, 0-9, '-')"),
  label: z.string().min(1).max(120),
});

/**
 * GET /api/admin/tags                   → tutti i tag con categoria
 * GET /api/admin/tags?category=<slug>   → tag di una categoria
 * GET /api/admin/tags/categories        → elenco categorie
 */
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const cats = await storage.listTagCategories();
    return res.json(cats);
  } catch (err) {
    console.error("[admin/tags] GET categories error:", err);
    return sendError(res, 500, "Errore lettura categorie tag");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    if (category) {
      const tags = await storage.listTagsByCategorySlug(category);
      return res.json({ category, tags });
    }
    const all = await storage.listAllTagsWithCategory();
    return res.json({ tags: all });
  } catch (err) {
    console.error("[admin/tags] GET list error:", err);
    return sendError(res, 500, "Errore lettura tag");
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createTagSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { categorySlug, slug, label } = parsed.data;
    const cat = await storage.getTagCategoryBySlug(categorySlug);
    if (!cat) return sendError(res, 404, "Categoria non trovata");
    const tag = await storage.createTag({ categoryId: cat.id, slug, label });
    return res.status(201).json(tag);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      return sendError(res, 409, "Tag già esistente in questa categoria");
    }
    console.error("[admin/tags] POST error:", err);
    return sendError(res, 500, "Errore creazione tag");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== "string") return sendError(res, 400, "ID mancante");
    const deleted = await storage.deleteTag(id);
    if (!deleted) return sendError(res, 404, "Tag non trovato");
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/tags] DELETE error:", err);
    return sendError(res, 500, "Errore eliminazione tag");
  }
});

export default router;
