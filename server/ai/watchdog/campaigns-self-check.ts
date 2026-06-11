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

function httpProbe(
  method: string,
  pathname: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<HttpProbeResp> {
  return new Promise((resolve, reject) => {
    const port = parseInt(process.env.PORT ?? "5000", 10);
    const headers: Record<string, string> = {
      [getInternalProbeHeaderName()]: getInternalProbeToken(),
      ...(extraHeaders ?? {}),
    };
    let payload: Buffer | undefined;
    if (body !== undefined) {
      payload = Buffer.from(JSON.stringify(body), "utf8");
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, timeout: 15_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try { json = raw ? JSON.parse(raw) : null; } catch {/* not json */}
          resolve({ status: res.statusCode ?? 0, body: raw, json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("probe timeout 15s")); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function runStep(
  name: string,
  fn: () => Promise<{ message?: string } | void>,
): Promise<SelfCheckEntry> {
  const start = Date.now();
  try {
    const out = await fn();
    return { name, status: "ok", durationMs: Date.now() - start, message: out?.message };
  } catch (err) {
    return {
      name, status: "error", durationMs: Date.now() - start,
      message: (err as Error)?.message?.slice(0, 400) ?? "errore sconosciuto",
    };
  }
}

function deriveOverall(checks: SelfCheckEntry[]): OverallStatus {
  if (checks.some((c) => c.status === "error")) return "broken";
  if (checks.some((c) => c.status === "warn")) return "degraded";
  return "ok";
}

function deriveSuggestedFix(checks: SelfCheckEntry[]): string | null {
  const failed = checks.find((c) => c.status === "error");
  if (!failed) return null;
  const map: Record<string, string> = {
    "GET /api/admin/advertisements (list)":
      "Verifica connessione DB e che la tabella ad_campaigns esista. Riavvia il backend.",
    "object_storage_upload_private":
      "Controlla i permessi del bucket object storage e che PRIVATE_OBJECT_DIR sia configurato.",
    "object_storage_upload_public":
      "Controlla i permessi del bucket object storage per public/ads/.",
    "POST /api/admin/advertisements (create)":
      "Controlla validators/ads.ts e che imageUrl sia accettato nel formato /api/ads/images/<file>.",
    "PUT /api/admin/advertisements/:id (toggle on)":
      "Verifica adsUpdateSchema e che updateAdCampaign gestisca isActive booleano.",
    "GET /api/ads/placement/all dopo attivazione":
      "Verifica getActiveAdsByUserType: la probe targetUserType='tutti' deve apparire per chiamate anonime.",
    "PUT /api/admin/advertisements/group/:groupId (toggle off)":
      "Verifica adsGroupUpdateSchema: deve accettare update con solo isActive.",
    "GET /api/ads/placement/all dopo disattivazione":
      "La probe disattivata non deve apparire. Controlla filtro isActive in getActiveAdsByUserType.",
    "DELETE /api/admin/advertisements/:id":
      "Verifica storage.deleteCampaign e che le FK su ad_campaigns siano in cascade.",
    "verify_object_removed_public":
      "deleteAdImageIfUnreferenced non rimuove il file da object storage. Controlla deleteObject().",
    "POST /api/moderator/advertisements (moderator create)":
      "Verifica requireModerator e che createModeratorLog sia protetto da safeModLog (un fallimento del log non deve causare 500).",
    "PUT /api/moderator/advertisements/:id (moderator update)":
      "Verifica la route PUT moderatore: log protetto da safeModLog e fallback graceful sull'upload immagine.",
  };
  return map[failed.name] ?? `Indagare il passo fallito: ${failed.name}.`;
}

async function buildAiBrief(
  checks: SelfCheckEntry[],
  overall: OverallStatus,
): Promise<{ brief: string; meta: { provider: string; model: string } } | null> {
  const lines: string[] = [
    `Sei un watchdog tecnico BikerLink. Genera in italiano un report MOLTO BREVE (max 5 righe) sullo stato del flusso admin Campagne pubblicitarie.`,
    `Esito complessivo: ${overall}.`,
    `Passi eseguiti:`,
    ...checks.map((s, i) => `${i + 1}. ${s.name} — ${s.status} (${s.durationMs}ms)${s.message ? ` — ${s.message}` : ""}`),
    `Se ci sono errori, indica per primo il passo fallito e una possibile causa. Niente saluti, niente emoji, niente markdown.`,
  ];
  try {
    const { value, model } = await runWithFallback({ role: "router" }, async (m) => {
      const res = await m.scheduler(() => generateText({
        model: m.model,
        prompt: lines.join("\n"),
        temperature: 0.2,
      }));
      const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      const cost = estimateCostUsd(m.modelId, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);
      return { text: res.text, cost, tokensIn: usage?.inputTokens ?? 0, tokensOut: usage?.outputTokens ?? 0 };
    });
    await logAiUsage(
      "campaigns-self-check",
      model.modelId,
      { tokensIn: value.tokensIn, tokensOut: value.tokensOut },
      "scheduler",
    );
    return { brief: value.text.trim(), meta: { provider: model.providerName, model: model.modelId } };
  } catch (e) {
    console.warn("[campaigns-self-check] AI brief skipped:", (e as Error).message);
    return null;
  }
}

// Task #2845 — account moderatore di test usato solo dal self-check per
// esercitare il flusso /api/moderator/advertisements via probe loopback.
// Persistente (riusato fra run) e non-loggabile (password segnaposto).
const SELFCHECK_MOD_EMAIL = "__selfcheck_mod__@bikerlink.internal";
async function ensureSelfCheckModerator(): Promise<string> {
  const existing = await storage.getUserByEmail(SELFCHECK_MOD_EMAIL);
  if (existing) {
    if (existing.role !== "moderator" && existing.role !== "admin") {
      await storage.updateUser(existing.id, { role: "moderator", status: "active" });
    } else if (existing.status !== "active") {
      await storage.updateUser(existing.id, { status: "active" });
    }
    return existing.id;
  }
  const created = await storage.createUser({
    nickname: "__selfcheck_mod__",
    email: SELFCHECK_MOD_EMAIL,
    password: "!selfcheck-no-login!",
    role: "moderator",
    status: "active",
    isFake: true,
    isSystem: true,
    emailVerified: true,
  });
  return created.id;
}

export interface RunSelfCheckOpts {
  triggeredBy: CampaignsSelfCheckResult["triggeredBy"];
  withAi?: boolean;
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
