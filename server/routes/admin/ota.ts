import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { otaReleases, appSettings } from "@shared/db";
import { eq, desc, isNull, and } from "drizzle-orm";
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

async function getDirectApplySetting(): Promise<boolean> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "ota_direct_apply"))
    .limit(1);
  return row?.value === "true";
}

async function syncStagingUpdates(): Promise<void> {
  const query = `
    query GetBranchUpdates($appId: String!) {
      app {
        byId(appId: $appId) {
          updateBranches(offset: 0, limit: 10) {
            id
            name
            updates(offset: 0, limit: 20) {
              id
              group
              message
              runtimeVersion
              createdAt
            }
          }
        }
      }
    }
  `;

  let data: { app?: { byId?: { updateBranches?: Array<{ id: string; name: string; updates?: Array<{ id: string; group?: string; message?: string; runtimeVersion?: string; createdAt?: string }> }> } } };
  try {
    data = await easGraphQL(query, { appId: EAS_PROJECT_ID }) as typeof data;
  } catch (err) {
    console.warn("[ota-sync] EAS GraphQL error:", err);
    return;
  }

  const branches = data?.app?.byId?.updateBranches ?? [];
  const stagingBranch = branches.find((b) => b.name === "staging");
  const updates = stagingBranch?.updates ?? [];
  if (updates.length === 0) return;

  const directApply = await getDirectApplySetting();

  for (const upd of updates) {
    const existing = await db.select({ id: otaReleases.id })
      .from(otaReleases)
      .where(eq(otaReleases.easUpdateId, upd.id))
      .limit(1);

    if (existing.length > 0) continue;

    const easGroupId = upd.group ?? null;

    if (directApply) {
      if (!easGroupId) {
        console.warn("[ota-sync] direct-apply: update senza groupId, inserisco come pending:", upd.id);
      } else {
        let promoted = false;
        try {
          await promoteToProduction(easGroupId, upd.message ?? null);
          promoted = true;
        } catch (err) {
          console.warn("[ota-sync] direct-apply: EAS promote failed, inserting as pending:", err);
        }

        if (promoted) {
          await db.insert(otaReleases).values({
            easUpdateId: upd.id,
            easGroupId,
            channel: "production",
            runtimeVersion: upd.runtimeVersion ?? null,
            message: upd.message ?? null,
            status: "approved",
            publishedAt: upd.createdAt ? new Date(upd.createdAt) : new Date(),
            approvedAt: new Date(),
            approvedBy: null,
          }).onConflictDoNothing();
          console.log("[ota-sync] direct-apply: auto-promoted groupId", easGroupId, "updateId", upd.id);
          continue;
        }
      }
    }

    await db.insert(otaReleases).values({
      easUpdateId: upd.id,
      easGroupId,
      channel: "staging",
      runtimeVersion: upd.runtimeVersion ?? null,
      message: upd.message ?? null,
      status: "pending",
      publishedAt: upd.createdAt ? new Date(upd.createdAt) : new Date(),
    }).onConflictDoNothing();
  }

  for (const upd of updates) {
    if (!upd.group) continue;
    await db.update(otaReleases)
      .set({ easGroupId: upd.group })
      .where(and(eq(otaReleases.easUpdateId, upd.id), isNull(otaReleases.easGroupId)));
  }
}

async function promoteToProduction(easGroupId: string, message?: string | null): Promise<void> {
  const mutation = `
    mutation RepublishUpdate($input: RepublishUpdateGroupInput!) {
      update {
        republishUpdateGroup(input: $input) {
          id
          group
          message
          runtimeVersion
          branch {
            name
          }
        }
      }
    }
  `;
  await easGraphQL(mutation, {
    input: {
      groupId: easGroupId,
      branchName: "production",
      message: message ?? undefined,
    },
  });
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

    if (!release.easGroupId) {
      return sendError(res, 400, "Questa release non ha un groupId EAS. Ri-sincronizza prima dal pannello admin (pulsante Sync).");
    }

    try {
      await promoteToProduction(release.easGroupId, release.message);
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
      easGroupId: release.easGroupId,
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

    if (!release.easGroupId) {
      return sendError(res, 400, "Questa release non ha un groupId EAS. Ri-sincronizza prima dal pannello admin (pulsante Sync).");
    }

    try {
      await promoteToProduction(release.easGroupId, release.message);
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

// GET /api/admin/ota/settings — legge il setting ota_direct_apply
router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const directApply = await getDirectApplySetting();
    return res.json({ directApply });
  } catch (err) {
    console.error("[ota] GET /settings error:", err);
    return sendError(res, 500, "Errore lettura impostazioni OTA");
  }
});

// POST /api/admin/ota/settings — upsert ota_direct_apply
router.post("/settings", async (req: Request, res: Response) => {
  try {
    const { directApply } = req.body as { directApply?: unknown };
    if (typeof directApply !== "boolean") {
      return sendError(res, 400, "Campo 'directApply' obbligatorio (booleano)");
    }
    const value = directApply ? "true" : "false";
    await db.insert(appSettings)
      .values({ key: "ota_direct_apply", value, description: "Applica OTA direttamente in production senza approvazione manuale" })
      .onConflictDoUpdate({ target: [appSettings.key], set: { value, updatedAt: new Date() } });
    return res.json({ directApply });
  } catch (err) {
    console.error("[ota] POST /settings error:", err);
    return sendError(res, 500, "Errore salvataggio impostazioni OTA");
  }
});

export default router;
export { syncStagingUpdates };
