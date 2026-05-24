import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { otaReleases } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const router = Router();

const EAS_PROJECT_ID = "a25192d7-72e5-46af-97d0-2d38ed9b78e3";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

async function easGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const token = process.env.EAS_TOKEN;
  if (!token) throw new Error("EAS_TOKEN non configurato");
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`EAS GraphQL HTTP ${res.status}`);
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors && (json.errors as unknown[]).length > 0) {
    throw new Error(`EAS GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function syncStagingUpdates(): Promise<void> {
  const query = `
    query GetBranchUpdates($appId: String!, $branchName: String!) {
      app {
        byId(appId: $appId) {
          updateBranches(offset: 0, limit: 1) {
            id
            name
          }
          updateBranchByName(name: $branchName) {
            id
            name
            updates(offset: 0, limit: 20) {
              id
              updateGroup
              message
              runtimeVersion
              createdAt
            }
          }
        }
      }
    }
  `;

  let data: { app?: { byId?: { updateBranchByName?: { updates?: Array<{ id: string; updateGroup: string; message?: string; runtimeVersion?: string; createdAt?: string }> } } } };
  try {
    data = await easGraphQL(query, { appId: EAS_PROJECT_ID, branchName: "staging" }) as typeof data;
  } catch (err) {
    console.warn("[ota-sync] EAS GraphQL error:", err);
    return;
  }

  const updates = data?.app?.byId?.updateBranchByName?.updates ?? [];
  if (updates.length === 0) return;

  for (const upd of updates) {
    const existing = await db.select({ id: otaReleases.id })
      .from(otaReleases)
      .where(eq(otaReleases.easUpdateId, upd.id))
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(otaReleases).values({
      easUpdateId: upd.id,
      channel: "staging",
      runtimeVersion: upd.runtimeVersion ?? null,
      message: upd.message ?? null,
      status: "pending",
      publishedAt: upd.createdAt ? new Date(upd.createdAt) : new Date(),
    }).onConflictDoNothing();
  }
}

async function promoteToProduction(easUpdateId: string): Promise<void> {
  const mutation = `
    mutation RepublishUpdate($updateId: ID!, $branchName: String!, $message: String) {
      updatePublishBranch(updateId: $updateId, branchName: $branchName) {
        id
        updateGroup
      }
    }
  `;
  await easGraphQL(mutation, { updateId: easUpdateId, branchName: "production" });
}

// GET /api/admin/ota/releases
router.get("/releases", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const syncFirst = req.query.sync !== "false";

    if (syncFirst) {
      await syncStagingUpdates().catch((err) => {
        console.warn("[ota] sync warning:", err);
      });
    }

    const rows = await db.select().from(otaReleases).orderBy(desc(otaReleases.publishedAt));

    const filtered = status
      ? rows.filter((r) => r.status === status)
      : rows;

    return res.json(filtered);
  } catch (err) {
    console.error("[ota] GET /releases error:", err);
    return sendError(res, 500, "Errore recupero OTA releases");
  }
});

// POST /api/admin/ota/:id/approve
router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "pending") return sendError(res, 400, `Stato non valido: ${release.status} (atteso: pending)`);

    try {
      await promoteToProduction(release.easUpdateId);
    } catch (err) {
      console.error("[ota] EAS promote error:", err);
      return sendError(res, 502, "Errore promozione su EAS production: " + (err instanceof Error ? err.message : String(err)));
    }

    const [updated] = await db
      .update(otaReleases)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        channel: "production",
      })
      .where(eq(otaReleases.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/approve error:", err);
    return sendError(res, 500, "Errore approvazione OTA");
  }
});

// POST /api/admin/ota/:id/reject
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "pending") return sendError(res, 400, `Stato non valido: ${release.status} (atteso: pending)`);

    const [updated] = await db
      .update(otaReleases)
      .set({
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: userId,
      })
      .where(eq(otaReleases.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/reject error:", err);
    return sendError(res, 500, "Errore rifiuto OTA");
  }
});

// GET /api/admin/ota/:id/try
router.get("/:id/try", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");

    const manifestUrl = `https://u.expo.dev/${EAS_PROJECT_ID}?channel-name=staging&runtime-version=${encodeURIComponent(release.runtimeVersion ?? "10.0.0")}`;

    return res.json({
      easUpdateId: release.easUpdateId,
      channel: release.channel,
      runtimeVersion: release.runtimeVersion,
      manifestUrl,
      message: release.message,
    });
  } catch (err) {
    console.error("[ota] GET /:id/try error:", err);
    return sendError(res, 500, "Errore recupero manifest OTA");
  }
});

// POST /api/admin/ota/:id/rollback — ri-promuove una release approvata su production
router.post("/:id/rollback", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.session.userId!;

    const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, id)).limit(1);
    if (!release) return sendError(res, 404, "OTA release non trovata");
    if (release.status !== "approved") return sendError(res, 400, `Rollback disponibile solo per release approvate (stato attuale: ${release.status})`);

    try {
      await promoteToProduction(release.easUpdateId);
    } catch (err) {
      console.error("[ota] EAS rollback promote error:", err);
      return sendError(res, 502, "Errore rollback su EAS production: " + (err instanceof Error ? err.message : String(err)));
    }

    const [updated] = await db
      .update(otaReleases)
      .set({
        approvedAt: new Date(),
        approvedBy: userId,
        channel: "production",
      })
      .where(eq(otaReleases.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error("[ota] POST /:id/rollback error:", err);
    return sendError(res, 500, "Errore rollback OTA");
  }
});

// POST /api/admin/ota/sync — forza sync manuale da EAS
router.post("/sync", async (_req: Request, res: Response) => {
  try {
    await syncStagingUpdates();
    const rows = await db.select().from(otaReleases).orderBy(desc(otaReleases.publishedAt));
    return res.json({ synced: true, count: rows.length, releases: rows });
  } catch (err) {
    console.error("[ota] POST /sync error:", err);
    return sendError(res, 500, "Errore sync OTA da EAS");
  }
});

export default router;
export { syncStagingUpdates };
