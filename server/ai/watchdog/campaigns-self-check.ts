// Task #2694 — Self-check end-to-end del flusso "Campagne pubblicitarie".
// Esegue probe HTTP reali contro le route admin (con bypass token loopback per
// non richiedere sessione) + /api/ads/placement/all unauth + object storage
// (.private/selfcheck/ e public/ads/). Risultato persistito su
// ai_watchdog_log (kind="report", scope="campaigns") + ultimo run in memoria.
import http from "http";
import crypto from "crypto";
import { generateText } from "ai";
import { runWithFallback, estimateCostUsd } from "../moderation/provider";
import { writeWatchdogLog } from "./log";
import { logAiUsage } from "../audit";
import { uploadBuffer, deleteObject, objectExists } from "../../objectStorage";
import { getInternalProbeToken, getInternalProbeHeaderName, getInternalProbeModeratorHeaderName } from "./internal-token";
import { storage } from "../../storage";
import { cleanupOrphanAdImages } from "../../ads/cleanup-orphan-images";

export type CheckStatus = "ok" | "warn" | "error";
export type OverallStatus = "ok" | "degraded" | "broken";

export interface SelfCheckEntry {
  name: string;
  status: CheckStatus;
  durationMs: number;
  message?: string;
}

export interface CampaignsSelfCheckResult {
  overall: OverallStatus;
  checks: SelfCheckEntry[];
  summary: string;
  suggestedFix: string | null;
  generatedAt: string;
  durationMs: number;
  triggeredBy: "manual" | "scheduler" | "startup";
  aiBrief?: string;
  aiMeta?: { provider: string; model: string };
}

let lastResult: CampaignsSelfCheckResult | null = null;
export function getLastSelfCheck(): CampaignsSelfCheckResult | null {
  return lastResult;
}

// 1x1 PNG transparent, ~70 byte, sufficient as a "real" image upload payload.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

interface HttpProbeResp {
  status: number;
  body: string;
  json: unknown | null;
}

import { httpProbe } from "./campaigns-self-check.part2";

export interface RunSelfCheckOpts {
  triggeredBy: "manual" | "scheduler" | "startup";
  withAi?: boolean;
}

async function runStep(
  name: string,
  fn: () => Promise<{ message?: string } | void>,
): Promise<SelfCheckEntry> {
  const t = Date.now();
  try {
    const r = await fn();
    const res = r as ({ message?: string } | null | undefined);
    return { name, status: "ok", durationMs: Date.now() - t, message: res?.message };
  } catch (e) {
    return {
      name,
      status: "error",
      durationMs: Date.now() - t,
      message: (e as Error)?.message?.slice(0, 400) ?? "errore sconosciuto",
    };
  }
}

async function ensureSelfCheckModerator(): Promise<string> {
  const SELFCHECK_EMAIL = "selfcheck-mod@bikerlink.internal";
  const existing = await storage.getUserByEmail(SELFCHECK_EMAIL);
  if (existing) return existing.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = await storage.createUser({
    email: SELFCHECK_EMAIL,
    username: "selfcheck-mod",
    password: crypto.randomBytes(32).toString("hex"),
    role: "moderator",
  } as any);
  return created.id;
}

function deriveOverall(checks: SelfCheckEntry[]): OverallStatus {
  if (checks.some((c) => c.status === "error")) return "broken";
  if (checks.some((c) => c.status === "warn")) return "degraded";
  return "ok";
}

function deriveSuggestedFix(checks: SelfCheckEntry[]): string | null {
  const first = checks.find((c) => c.status === "error");
  if (!first) return null;
  return `Controlla il passo "${first.name}": ${first.message ?? "errore sconosciuto"}`;
}

async function buildAiBrief(
  checks: SelfCheckEntry[],
  overall: OverallStatus,
): Promise<{ brief: string; meta: { provider: string; model: string } } | null> {
  if (overall === "ok") return null;
  try {
    const prompt = `Self-check campagne BikerLink: stato ${overall}.\n${checks
      .map((c) => `${c.name}: ${c.status}${c.message ? ` (${c.message})` : ""}`)
      .join("\n")}\nSuggerisci la causa più probabile in 1-2 frasi.`;
    const { value: generated, model: resolvedModel } = await runWithFallback({ role: "brain" }, (m) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generateText({ model: m.model as any, prompt }),
    );
    await logAiUsage("campaigns-self-check", resolvedModel.modelId, { tokensIn: 0, tokensOut: 150 });
    return { brief: generated.text, meta: { provider: resolvedModel.providerName, model: resolvedModel.modelId } };
  } catch {
    return null;
  }
}

export async function runCampaignsSelfCheck(opts: RunSelfCheckOpts): Promise<CampaignsSelfCheckResult> {
  const t0 = Date.now();
  const generatedAt = new Date().toISOString();
  const checks: SelfCheckEntry[] = [];

  const runId = crypto.randomBytes(6).toString("hex");
  const probeBaseName = `__selfcheck__-${runId}`;
  const publicFileName = `selfcheck-${runId}.png`;
  const publicObjectPath = `public/ads/${publicFileName}`;
  const privateObjectPath = `.private/selfcheck/probe-${runId}.png`;
  const imageUrl = `/api/ads/images/${publicFileName}`;

  let createdCampaignId: string | null = null;
  let createdGroupId: string | null = null;
  let modCampaignId: string | null = null;
  let selfCheckModeratorId: string | null = null;

  async function probeDbState(): Promise<{ exists: boolean; isActive: boolean | null; via: "db" }> {
    // L'endpoint pubblico /api/ads/placement/all filtra intenzionalmente
    // le campagne __selfcheck__* per non mostrarle agli utenti reali.
    // Verifichiamo direttamente nel DB tramite ID se isActive è stato salvato
    // correttamente, indipendentemente dal filtro nome e da ads_enabled.
    const campaign = createdCampaignId ? await storage.getAdCampaign(createdCampaignId) : undefined;
    return {
      exists: campaign !== undefined,
      isActive: campaign ? campaign.isActive : null,
      via: "db",
    };
  }

  try {
    // 1. List
    checks.push(await runStep("GET /api/admin/advertisements (list)", async () => {
      const r = await httpProbe("GET", "/api/admin/advertisements");
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (!Array.isArray(r.json)) throw new Error("risposta non è un array");
      return { message: `${(r.json as unknown[]).length} campagne` };
    }));

    // 2. Upload privato (.private/selfcheck/) — timeout esplicito 10s; se scade → WARN non ERROR
    {
      const privateStart = Date.now();
      try {
        await Promise.race([
          (async () => {
            await uploadBuffer(privateObjectPath, TINY_PNG, "image/png");
            const exists = await objectExists(privateObjectPath);
            if (!exists) throw new Error("oggetto privato non trovato dopo upload");
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("__PRIVATE_BUCKET_TIMEOUT__")), 10_000),
          ),
        ]);
        checks.push({
          name: "object_storage_upload_private",
          status: "ok",
          durationMs: Date.now() - privateStart,
          message: privateObjectPath,
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? "errore sconosciuto";
        const isTimeout = msg === "__PRIVATE_BUCKET_TIMEOUT__";
        checks.push({
          name: "object_storage_upload_private",
          status: isTimeout ? "warn" : "error",
          durationMs: Date.now() - privateStart,
          message: isTimeout
            ? "timeout 10s — bucket privato non raggiungibile (non bloccante per gli utenti)"
            : msg.slice(0, 400),
        });
      }
    }

    // 3. Upload pubblico (public/ads/<file>) — è la copia usata dall'URL della campagna
    checks.push(await runStep("object_storage_upload_public", async () => {
      await uploadBuffer(publicObjectPath, TINY_PNG, "image/png");
      const exists = await objectExists(publicObjectPath);
      if (!exists) throw new Error("oggetto pubblico non trovato dopo upload");
      return { message: publicObjectPath };
    }));

    // 4. Create campagna (targetUserType "tutti", placement "all", groupId noto)
    const probeGroupId = crypto.randomUUID();
    checks.push(await runStep("POST /api/admin/advertisements (create)", async () => {
      const r = await httpProbe("POST", "/api/admin/advertisements", {
        name: probeBaseName,
        sponsor: "BikerLink SelfCheck",
        imageUrl,
        targetUserType: "tutti",
        rotationDuration: 10,
        rotationMode: "sequential",
        sortOrder: 9999,
        placement: "all",
        groupId: probeGroupId,
      });
      if (r.status !== 201) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
      const c = r.json as { id?: string; groupId?: string | null } | null;
      if (!c?.id) throw new Error("create non ha restituito id");
      createdCampaignId = c.id;
      createdGroupId = c.groupId ?? null;
      return { message: `id=${c.id}` };
    }));

    // 5. Toggle ON via PUT /:id
    if (createdCampaignId) {
      checks.push(await runStep("PUT /api/admin/advertisements/:id (toggle on)", async () => {
        const r = await httpProbe("PUT", `/api/admin/advertisements/${createdCampaignId}`, {
          isActive: true,
        });
        if (r.status !== 200) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
        const c = r.json as { isActive?: boolean } | null;
        if (!c?.isActive) throw new Error("isActive non true dopo update");
        return { message: "isActive=true" };
      }));
    }

    // 6. La probe deve avere isActive=true nel DB dopo il toggle ON.
    //    Usiamo getAdCampaign diretto perché getActiveAdsByUserType filtra __selfcheck__*.
    if (createdCampaignId) {
      checks.push(await runStep("GET /api/ads/placement/all dopo attivazione", async () => {
        const r = await probeDbState();
        if (!r.exists) throw new Error(`ad non trovato nel DB (via=${r.via})`);
        if (r.isActive !== true) throw new Error(`isActive=${r.isActive} nel DB dopo toggle ON (via=${r.via})`);
        return { message: `isActive=true confermato nel DB (via=${r.via})` };
      }));
    }

    // 7. Toggle OFF via gruppo (verifica fix gruppo)
    if (createdGroupId) {
      checks.push(await runStep("PUT /api/admin/advertisements/group/:groupId (toggle off)", async () => {
        const r = await httpProbe("PUT", `/api/admin/advertisements/group/${createdGroupId}`, {
          isActive: false,
        });
        if (r.status !== 200) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
        return { message: "gruppo disattivato" };
      }));
    }

    // 8. La probe deve avere isActive=false nel DB dopo il toggle OFF.
    if (createdCampaignId) {
      checks.push(await runStep("GET /api/ads/placement/all dopo disattivazione", async () => {
        const r = await probeDbState();
        if (!r.exists) throw new Error(`ad non trovato nel DB (via=${r.via})`);
        if (r.isActive !== false) throw new Error(`isActive=${r.isActive} nel DB dopo toggle OFF (via=${r.via})`);
        return { message: `isActive=false confermato nel DB (via=${r.via})` };
      }));
    }

    // 9. DELETE
    if (createdCampaignId) {
      checks.push(await runStep("DELETE /api/admin/advertisements/:id", async () => {
        const r = await httpProbe("DELETE", `/api/admin/advertisements/${createdCampaignId}`);
        if (r.status !== 200) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
        return { message: "200 OK" };
      }));
    }

    // 10. Verifica che l'oggetto pubblico sia stato rimosso da deleteAdImageIfUnreferenced
    checks.push(await runStep("verify_object_removed_public", async () => {
      // deleteAdImageIfUnreferenced gira async (.catch(()=>{})) — attendi breve
      await new Promise((r) => setTimeout(r, 800));
      const stillThere = await objectExists(publicObjectPath);
      if (stillThere) throw new Error(`oggetto ${publicObjectPath} non rimosso dopo delete campagna`);
      return { message: "rimosso" };
    }));

    // 11. Task #2845 — flusso moderatore: create senza immagine deve riuscire
    //     (201) e il log di audit non deve mai causare un 500.
    checks.push(await runStep("POST /api/moderator/advertisements (moderator create)", async () => {
      selfCheckModeratorId = await ensureSelfCheckModerator();
      const r = await httpProbe("POST", "/api/moderator/advertisements", {
        name: `${probeBaseName}-mod`,
        sponsor: "BikerLink SelfCheck",
        targetUserType: "tutti",
        rotationDuration: 10,
        rotationMode: "sequential",
        sortOrder: 9999,
        placement: "all",
      }, { [getInternalProbeModeratorHeaderName()]: selfCheckModeratorId });
      if (r.status !== 201) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
      const c = r.json as { id?: string } | null;
      if (!c?.id) throw new Error("create moderatore non ha restituito id");
      modCampaignId = c.id;
      return { message: `id=${c.id}` };
    }));

    // 12. Update via route moderatore — deve riuscire (200) col log protetto.
    if (modCampaignId && selfCheckModeratorId) {
      checks.push(await runStep("PUT /api/moderator/advertisements/:id (moderator update)", async () => {
        const r = await httpProbe("PUT", `/api/moderator/advertisements/${modCampaignId}`, {
          sortOrder: 1234,
        }, { [getInternalProbeModeratorHeaderName()]: selfCheckModeratorId! });
        if (r.status !== 200) throw new Error(`status ${r.status} body=${r.body.slice(0, 200)}`);
        return { message: "update ok" };
      }));
    }

    // 13. Pulizia periodica immagini pubblicitarie orfane su Object Storage.
    //     A questo punto la campagna probe admin è già stata eliminata (step 9)
    //     e la sua immagine pubblica rimossa (step 10); la campagna moderatore
    //     non ha immagine. Quindi la sweep non tocca file della probe in corso.
    //     Step non bloccante: errori parziali → warn, sweep saltata → warn.
    //     Se gli orfani trovati superano la soglia configurabile
    //     `ads_orphan_alert_threshold` (default 10), viene emesso un segnale
    //     "high" al proposer AI per segnalare un possibile bug a monte.
    {
      const cleanupStart = Date.now();
      try {
        const res = await cleanupOrphanAdImages();
        const msg = res.skipped
          ? `sweep saltata: ${res.reason}`
          : `${res.scanned} file scansionati, ${res.orphans} orfani, ${res.deleted} eliminati, ${res.errors} errori`;
        checks.push({
          name: "cleanup_orphan_ad_images",
          status: res.skipped || res.errors > 0 ? "warn" : "ok",
          durationMs: Date.now() - cleanupStart,
          message: msg,
        });

        // Persiste il risultato della sweep come AppSetting (valueJson) in modo
        // che il collector del watchdog aggregator possa leggerlo al prossimo
        // tick e, se gli orfani superano la soglia, emettere un segnale "high"
        // visibile al proposer AI.
        if (!res.skipped) {
          await storage.upsertAppSetting(
            "ads_orphan_last_cleanup",
            undefined,
            { scanned: res.scanned, orphans: res.orphans, deleted: res.deleted, errors: res.errors, runAt: new Date().toISOString() },
          );
          if (res.orphans > 0) {
            // Log immediato; il segnale formale arriva dall'aggregator al tick successivo.
            console.warn(
              `[campaigns-self-check] ${res.orphans} immagini orfane trovate — il collector watchdog emetterà il segnale se supera la soglia configurabile.`,
            );
          }
        }
      } catch (err) {
        checks.push({
          name: "cleanup_orphan_ad_images",
          status: "warn",
          durationMs: Date.now() - cleanupStart,
          message: `cleanup fallito (non bloccante): ${(err as Error)?.message?.slice(0, 300)}`,
        });
      }
    }

  } finally {
    // Cleanup di sicurezza: probe privata sempre rimossa
    try { await deleteObject(privateObjectPath); } catch {/* ignore */}

    // Helper: tenta la DELETE HTTP con max `maxAttempts` tentativi (retry su errore).
    async function deleteProbeWithRetry(id: string, label: string, maxAttempts = 2): Promise<void> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await httpProbe("DELETE", `/api/admin/advertisements/${id}`);
          if (r.status === 200 || r.status === 404) return;
          if (attempt < maxAttempts) {
            await new Promise((res) => setTimeout(res, 500 * attempt));
          } else {
            console.warn(`[campaigns-self-check] WARN: campagna test non eliminata, id=${id} label=${label} status=${r.status}`);
          }
        } catch (e) {
          if (attempt < maxAttempts) {
            await new Promise((res) => setTimeout(res, 500 * attempt));
          } else {
            console.warn(`[campaigns-self-check] WARN: campagna test non eliminata, id=${id} label=${label} err=${(e as Error)?.message}`);
          }
        }
      }
    }

    // Se la DELETE HTTP non è andata, prova a forzare via probe HTTP (idempotente)
    if (createdCampaignId) {
      try {
        const stillExists = await objectExists(publicObjectPath);
        if (stillExists) await deleteObject(publicObjectPath);
      } catch {/* ignore */}
      await deleteProbeWithRetry(createdCampaignId, "admin-probe");
    }
    // La route moderatore non espone DELETE: la campagna creata dal probe viene
    // rimossa tramite la route admin (idempotente, stesso storage).
    if (modCampaignId) {
      await deleteProbeWithRetry(modCampaignId, "mod-probe");
    }

    // CLEANUP GARANTITO (Task #4942): hard-delete a livello DB di TUTTE le
    // campagne __selfcheck__* — gira sempre, anche se le DELETE HTTP per-id
    // sopra sono fallite o gli ID non sono stati catturati. Gli artefatti del
    // prober non devono mai sopravvivere né finire nel cestino (ghost): vanno
    // rimossi davvero dal DB.
    try {
      const removed = await storage.deleteSelfcheckCampaigns();
      if (removed > 0) {
        console.log(`[campaigns-self-check] cleanup garantito: ${removed} campagne __selfcheck__ hard-deleted dal DB`);
      }
    } catch (sweepErr) {
      console.warn("[campaigns-self-check] WARN: hard-delete __selfcheck__ fallito (non-fatal):", (sweepErr as Error)?.message);
    }
  }

  const overall = deriveOverall(checks);
  const failedCount = checks.filter((c) => c.status === "error").length;
  const summary = overall === "ok"
    ? `Tutti i ${checks.length} passi del flusso Campagne hanno avuto successo (${Date.now() - t0}ms).`
    : overall === "degraded"
      ? `${checks.length} passi eseguiti con avvisi (${Date.now() - t0}ms). Nessun errore bloccante.`
      : `Self-check fallito: ${failedCount}/${checks.length} passi in errore. Controllare il primo passo "error" e seguire il suggerimento.`;
  const suggestedFix = deriveSuggestedFix(checks);

  let aiBrief: string | undefined;
  let aiMeta: { provider: string; model: string } | undefined;
  if (opts.withAi !== false) {
    const ai = await buildAiBrief(checks, overall);
    if (ai) { aiBrief = ai.brief; aiMeta = ai.meta; }
  }

  const result: CampaignsSelfCheckResult = {
    overall,
    checks,
    summary,
    suggestedFix,
    generatedAt,
    durationMs: Date.now() - t0,
    triggeredBy: opts.triggeredBy,
    aiBrief,
    aiMeta,
  };
  lastResult = result;

  await writeWatchdogLog({
    kind: "report",
    scope: "campaigns",
    status: overall === "ok" ? "ok" : overall === "degraded" ? "warn" : "error",
    summary: `Self-check campagne: ${overall} (${checks.length} passi, ${result.durationMs}ms, trigger=${opts.triggeredBy})`,
    details: result,
  });

  return result;
}

let timer: NodeJS.Timeout | null = null;
const SIX_HOURS = 6 * 60 * 60_000;

export function startCampaignsSelfCheckScheduler(): void {
  if (timer) return;
  setTimeout(() => {
    runCampaignsSelfCheck({ triggeredBy: "startup" }).catch((e) =>
      console.warn("[campaigns-self-check] startup run failed:", e));
  }, 30_000);
  timer = setInterval(() => {
    runCampaignsSelfCheck({ triggeredBy: "scheduler" }).catch((e) =>
      console.warn("[campaigns-self-check] scheduled run failed:", e));
  }, SIX_HOURS);
  timer.unref?.();
  console.log("[campaigns-self-check] scheduler avviato (ogni 6h)");
}

export function stopCampaignsSelfCheckScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
