// Task #4922 — Whitelist azioni AI Assistant ADMIN.
// A differenza delle azioni utente (client-side, eseguite dall'app dopo conferma),
// le azioni admin sono SEMPRE server-side: riusano i metodi storage già usati dagli
// endpoint del pannello admin (approvazione/visibilità business, ricalcolo passaggi).
//
// Flusso: l'agente propone `ACTION: {"actionId","params"}` nel testo → il server la
// filtra contro questa whitelist hardcoded → la propone all'admin che conferma → il
// server valida i params (zod) ed esegue, con permission-check (role === admin) e
// audit log. Nessun eval/dynamic exec: l'id è validato contro un Set literal.
import { z } from "zod";
import { storage } from "../../storage";

export interface AdminAssistantActionDef {
  id: string;
  // Descrizione esposta all'LLM nel system prompt (italiano, conciso).
  description: string;
  // Testo statico (NON generato dall'LLM) mostrato all'admin nel prompt di conferma.
  confirmLabel: string;
  paramsSchema: z.ZodTypeAny;
}

const DEFAULT_RADIUS_M = 150;
const DEFAULT_MAX_SPEED_KMH = 60;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const ADMIN_ASSISTANT_ACTIONS = {
  "approve-business": {
    id: "approve-business",
    description:
      "Approva un business (locale o concessionaria) in attesa di approvazione. Param: businessId (stringa, l'ID del business). Usa SOLO gli ID dei business elencati nello snapshot piattaforma.",
    confirmLabel: "Confermi l'approvazione di questo business?",
    paramsSchema: z.object({ businessId: z.string().min(1, "businessId obbligatorio") }),
  },
  "set-business-active": {
    id: "set-business-active",
    description:
      "Attiva o disattiva la visibilità marketing di un business. Params: businessId (stringa), isActive (boolean — true per renderlo visibile, false per nasconderlo). Usa SOLO gli ID dei business dello snapshot.",
    confirmLabel: "Confermi il cambio di visibilità di questo business?",
    paramsSchema: z.object({
      businessId: z.string().min(1, "businessId obbligatorio"),
      isActive: z.boolean(),
    }),
  },
  "recompute-business-passages": {
    id: "recompute-business-passages",
    description:
      "Ricalcola i passaggi qualificati (report reach) di tutti i business per un mese. Param opzionale: month (formato 'YYYY-MM', default mese corrente).",
    confirmLabel: "Confermi il ricalcolo dei passaggi qualificati?",
    paramsSchema: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "month deve essere nel formato YYYY-MM").optional(),
    }),
  },
} as const satisfies Record<string, AdminAssistantActionDef>;

export type AdminAssistantActionId = keyof typeof ADMIN_ASSISTANT_ACTIONS;

// Set literal hardcoded — usato per validare l'id ricevuto dal client/LLM.
const ADMIN_ACTION_IDS = new Set<string>(Object.keys(ADMIN_ASSISTANT_ACTIONS));

export function isWhitelistedAdminAction(id: string): id is AdminAssistantActionId {
  return ADMIN_ACTION_IDS.has(id);
}

export function validateAdminActionParams(id: AdminAssistantActionId, raw: unknown):
  | { ok: true; params: unknown }
  | { ok: false; error: string } {
  const def = ADMIN_ASSISTANT_ACTIONS[id];
  const parsed = def.paramsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Parametri non validi" };
  }
  return { ok: true, params: parsed.data };
}

export function listAdminActionsForPrompt(): string {
  return Object.values(ADMIN_ASSISTANT_ACTIONS)
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");
}

export type AdminActionResult =
  | { ok: true; summary: string; data?: unknown }
  | { ok: false; httpStatus: number; error: string };

async function getReachConfig(): Promise<{ radiusM: number; maxSpeedKmh: number }> {
  const radiusSetting = await storage.getAppSetting("business_reach_radius_m");
  const speedSetting = await storage.getAppSetting("business_reach_max_speed_kmh");
  const radiusM = Number(radiusSetting?.value) || DEFAULT_RADIUS_M;
  const maxSpeedKmh = Number(speedSetting?.value) || DEFAULT_MAX_SPEED_KMH;
  return { radiusM, maxSpeedKmh };
}

/**
 * Esegue un'azione admin server-side. Riusa i metodi storage degli endpoint del
 * pannello admin così il comportamento resta identico. Il permission-check
 * (role === admin) e l'audit log sono responsabilità del chiamante (route).
 */
export async function executeAdminAction(
  id: AdminAssistantActionId,
  params: unknown,
): Promise<AdminActionResult> {
  if (id === "approve-business") {
    const p = params as { businessId: string };
    const biz = await storage.getBusiness(p.businessId);
    if (!biz) return { ok: false, httpStatus: 404, error: "Business non trovato" };
    if (biz.isApproved) {
      return { ok: true, summary: `Il business "${biz.name}" è già approvato.`, data: { businessId: biz.id, isApproved: true } };
    }
    const updated = await storage.updateBusiness(p.businessId, { isApproved: true });
    if (!updated) return { ok: false, httpStatus: 500, error: "Errore approvazione business" };
    console.info(`[admin-ai-action] approve-business id=${updated.id} name="${updated.name}"`);
    return { ok: true, summary: `Business "${updated.name}" approvato.`, data: { businessId: updated.id, isApproved: true } };
  }

  if (id === "set-business-active") {
    const p = params as { businessId: string; isActive: boolean };
    const biz = await storage.getBusiness(p.businessId);
    if (!biz) return { ok: false, httpStatus: 404, error: "Business non trovato" };
    const updated = await storage.updateBusiness(p.businessId, { isActive: p.isActive });
    if (!updated) return { ok: false, httpStatus: 500, error: "Errore aggiornamento visibilità business" };
    console.info(`[admin-ai-action] set-business-active id=${updated.id} name="${updated.name}" isActive=${p.isActive}`);
    return {
      ok: true,
      summary: `Business "${updated.name}" ${p.isActive ? "reso visibile" : "nascosto"}.`,
      data: { businessId: updated.id, isActive: p.isActive },
    };
  }

  if (id === "recompute-business-passages") {
    const p = params as { month?: string };
    const month = p.month && /^\d{4}-\d{2}$/.test(p.month) ? p.month : currentMonth();
    const { radiusM, maxSpeedKmh } = await getReachConfig();
    const all = await storage.getBusinesses();
    let computed = 0;
    for (const b of all) {
      if (b.latitude == null || b.longitude == null) continue;
      await storage.computeQualifiedPassages(b.id, month, radiusM, maxSpeedKmh);
      computed += 1;
    }
    console.info(`[admin-ai-action] recompute-business-passages month=${month} computed=${computed}`);
    return {
      ok: true,
      summary: `Passaggi qualificati ricalcolati per ${computed} business (mese ${month}).`,
      data: { month, computed },
    };
  }

  return { ok: false, httpStatus: 400, error: "Azione admin non implementata" };
}
