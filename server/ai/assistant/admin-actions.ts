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
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { aiKnowledgeGaps } from "@shared/db";
import {
  execVpsCommand,
  startVpsJob,
  getVpsJob,
  isDestructiveCommand,
} from "./vps-ops";
import { runHorusAnalysisNow } from "./horus-analyzer";
import { fetchCodeContextForFiles, isGithubContextConfigured } from "./github-context";
import { startAresJob, getAresJobStatus, type AresJobMode } from "../ares-jobs";
import { startHorusScan, getAllHorusScanStatus, formatScanStatusText } from "./horus-scanner";

// Task #5322 — Livello di rischio dell'azione admin. Guida il client (badge/UX di
// conferma) e viene loggato nell'audit trail. "high" = distruttivo/irreversibile.
export type AdminActionRiskLevel = "low" | "medium" | "high";

export interface AdminAssistantActionDef {
  id: string;
  // Descrizione esposta all'LLM nel system prompt (italiano, conciso).
  description: string;
  // Testo statico (NON generato dall'LLM) mostrato all'admin nel prompt di conferma.
  confirmLabel: string;
  // Task #5322 — Metadati di sicurezza esposti al client + audit.
  riskLevel: AdminActionRiskLevel;
  // Se true il client DEVE mostrare una conferma esplicita prima di eseguire.
  requiresConfirm: boolean;
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
    riskLevel: "medium",
    requiresConfirm: true,
    paramsSchema: z.object({ businessId: z.string().min(1, "businessId obbligatorio") }),
  },
  "set-business-active": {
    id: "set-business-active",
    description:
      "Attiva o disattiva la visibilità marketing di un business. Params: businessId (stringa), isActive (boolean — true per renderlo visibile, false per nasconderlo). Usa SOLO gli ID dei business dello snapshot.",
    confirmLabel: "Confermi il cambio di visibilità di questo business?",
    riskLevel: "medium",
    requiresConfirm: true,
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
    // Non distruttiva (ricalcolo idempotente) ma pesante: chiediamo comunque conferma.
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/, "month deve essere nel formato YYYY-MM").optional(),
    }),
  },
  // Task #5322 — Chiude una lacuna di conoscenza (ai_knowledge_gaps) marcandola
  // "dismissed": non verrà più proposta all'auto-apprendimento locale.
  "dismiss-knowledge-gap": {
    id: "dismiss-knowledge-gap",
    description:
      "Marca come 'scartata' una lacuna di conoscenza dell'AI (una domanda utente senza risposta pertinente), così non verrà più proposta all'auto-apprendimento. Param: gapId (stringa, l'ID della lacuna dallo snapshot). Param opzionale: note (stringa, motivazione).",
    confirmLabel: "Confermi di scartare questa lacuna di conoscenza?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({
      gapId: z.string().min(1, "gapId obbligatorio"),
      note: z.string().max(500).optional(),
    }),
  },
  // Task #5322 — Operazioni sul VPS Google "dragonfly" (SOLO admin). Esecuzione
  // server-side via helper (vps-ops.ts → scripts/gce/gce.py). Ogni op mutante
  // richiede conferma; i comandi distruttivi richiedono ANCHE confirmDestructive
  // (doppia conferma). La chiave SSH non transita mai da qui.
  "vps-exec": {
    id: "vps-exec",
    description:
      "Esegue un comando/script BREVE (sincrono) sul VPS Google 'dragonfly' e restituisce l'output. Param: command (stringa, il comando bash). Params opzionali: sudo (boolean), confirmDestructive (boolean, OBBLIGATORIO true per comandi distruttivi come rm -rf, apt remove, reboot). Usa per install/verifica/lettura veloce.",
    confirmLabel: "Confermi l'esecuzione di questo comando sul VPS?",
    riskLevel: "high",
    requiresConfirm: true,
    paramsSchema: z.object({
      command: z.string().min(1, "command obbligatorio").max(2000, "comando troppo lungo"),
      sudo: z.boolean().optional(),
      confirmDestructive: z.boolean().optional(),
    }),
  },
  "vps-start-job": {
    id: "vps-start-job",
    description:
      "Avvia un JOB LUNGO asincrono sul VPS Google (es. '24h di ping verso un sito'): parte distaccato e l'esito arriva dopo, in chat e via notifica. Param: command (stringa). Params opzionali: label (stringa breve descrittiva), confirmDestructive (boolean per comandi distruttivi).",
    confirmLabel: "Confermi l'avvio di questo job lungo sul VPS?",
    riskLevel: "high",
    requiresConfirm: true,
    paramsSchema: z.object({
      command: z.string().min(1, "command obbligatorio").max(2000, "comando troppo lungo"),
      label: z.string().max(120).optional(),
      confirmDestructive: z.boolean().optional(),
    }),
  },
  "vps-job-status": {
    id: "vps-job-status",
    description:
      "Legge stato ed esito (se pronto) di un job VPS avviato in precedenza. Param: jobId (stringa, l'ID del job). Sola lettura.",
    confirmLabel: "Mostro lo stato del job VPS?",
    riskLevel: "low",
    requiresConfirm: false,
    paramsSchema: z.object({
      jobId: z.string().min(1, "jobId obbligatorio"),
    }),
  },
  // Task #5326 — Trigger manuale del ciclo di analisi autonoma di Horus (ignora
  // il gate load-aware/cooldown dello scheduler in background). Sola lettura:
  // legge db-integrity/watchdog e scrive SOLO il proprio artifact di analisi.
  "horus-analyze-now": {
    id: "horus-analyze-now",
    description:
      "Esegue subito un ciclo di analisi autonoma di Horus (db-integrity + watchdog), ignorando il gate di carico/cooldown dello scheduler in background. Sola lettura sui dati piattaforma, scrive solo il proprio report di analisi.",
    confirmLabel: "Confermi l'avvio di un'analisi Horus immediata?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({}),
  },
  // Task #5326 — Modalità "code reviewer" di Horus: fetch read-only di file
  // specifici da GitHub (HORUS_GITHUB_TOKEN, fine-grained e mai scrittura,
  // dedicato solo a Horus — mai il DIAG_GITHUB_TOKEN uso umano) da iniettare
  // nel prossimo turno come contesto di revisione codice.
  "horus-code-review": {
    id: "horus-code-review",
    description:
      "Recupera da GitHub (sola lettura, branch main) il codice sorgente dei file indicati per farli rivedere a Horus nella modalità code reviewer. Param: files (array di percorsi relativi al repo, max 8). Non esegue né modifica nulla su GitHub.",
    confirmLabel: "Confermi il recupero di questi file da GitHub per la revisione?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({
      files: z.array(z.string().min(1)).min(1).max(8),
    }),
  },
  // Task #87 — Avvio on-demand dei job long-running di Ares. Sola lettura: Ares
  // legge l'intera app e (per il manuale) scrive SOLO nello storage del manuale
  // di Nadir. Mai esecuzione automatica: parte solo da qui o da Bowie in chat.
  "ares-analyze-app": {
    id: "ares-analyze-app",
    description:
      "Avvia il job in background di ANALISI completa di codice + DB di Ares (legge l'intera app + i controlli di integrità DB esistenti). Al termine produce proposte concrete. Sola lettura: propone, non applica. Lavoro lungo (anche ore), lo stato è consultabile con ares-job-status.",
    confirmLabel: "Confermi l'avvio dell'analisi completa codice+DB di Ares (job in background)?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({}),
  },
  "ares-generate-manual": {
    id: "ares-generate-manual",
    description:
      "Avvia il job in background di GENERAZIONE MANUALE di Ares: legge l'intera app e produce un manuale testuale per funzionalità, salvato nello storage del manuale di Nadir (con backup della versione precedente) e reindicizzato. Lavoro lungo (anche ore), lo stato è consultabile con ares-job-status.",
    confirmLabel: "Confermi l'avvio della generazione del manuale da parte di Ares (job in background)?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({}),
  },
  "ares-job-status": {
    id: "ares-job-status",
    description:
      "Legge lo stato dei job di Ares (analisi e manuale): in corso/completato/fallito, avanzamento e — se completato — un estratto del risultato. Param opzionale: mode ('analysis' | 'manual'); se assente riporta entrambi. Sola lettura.",
    confirmLabel: "Mostro lo stato dei job di Ares?",
    riskLevel: "low",
    requiresConfirm: false,
    paramsSchema: z.object({ mode: z.enum(["analysis", "manual"]).optional() }),
  },
  // Task #86 — Scansione COMPLETA e autonoma dell'intero codice sorgente +
  // struttura DB da parte di Horus. Solo su richiesta esplicita, mai automatica.
  // Una volta avviata prosegue da sola a lotti (i file invariati vengono saltati)
  // e al termine produce PROPOSTE azionabili (mai modifiche). Sola lettura.
  "horus-scan-code-db": {
    id: "horus-scan-code-db",
    description:
      "Avvia una scansione COMPLETA e autonoma dell'intero codice sorgente (server/client/shared) + stato integrità del DB da parte di Horus. Una volta avviata prosegue da sola a lotti fino a coprire tutti i file pendenti (quelli invariati dall'ultima passata vengono saltati). Al termine produce proposte azionabili, mai modifiche. SOLA LETTURA. Solo su richiesta esplicita, mai automatica.",
    confirmLabel: "Confermi l'avvio della scansione completa codice+DB di Horus?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({}),
  },
  // Task #86 — Generazione autonoma del manuale testuale dell'app da parte di
  // Horus: legge tutta l'app e produce un manuale per funzionalità, salvato nello
  // storage del manuale di Nadir (versione precedente conservata) e reindicizzato.
  "horus-generate-manual": {
    id: "horus-generate-manual",
    description:
      "Avvia la generazione autonoma del MANUALE testuale dell'app da parte di Horus: legge tutta l'app e produce un manuale organizzato per funzionalità (non un dump di codice), pensato per istruire gli agenti AI. Al termine lo salva nello storage del manuale di Nadir (conservando la versione precedente) e lo reindicizza per la ricerca semantica. SOLA LETTURA. Solo su richiesta esplicita, mai automatica.",
    confirmLabel: "Confermi l'avvio della generazione del manuale da parte di Horus?",
    riskLevel: "low",
    requiresConfirm: true,
    paramsSchema: z.object({}),
  },
  // Task #86 — Stato di avanzamento delle scansioni Horus (sola lettura).
  "horus-scan-status": {
    id: "horus-scan-status",
    description:
      "Mostra lo stato di avanzamento delle due scansioni Horus (analisi codice+DB e generazione manuale): quanti file letti/saltati/pendenti e l'esito dell'ultima passata. Sola lettura, non avvia nulla.",
    confirmLabel: "Mostro lo stato delle scansioni Horus?",
    riskLevel: "low",
    requiresConfirm: false,
    paramsSchema: z.object({}),
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
    .map((a) => `- ${a.id} [rischio: ${a.riskLevel}]: ${a.description}`)
    .join("\n");
}

/** Task #5322 — Metadati di sicurezza di un'azione admin (per client + audit). */
export function getAdminActionMeta(id: AdminAssistantActionId): {
  riskLevel: AdminActionRiskLevel;
  requiresConfirm: boolean;
  confirmLabel: string;
} {
  const def = ADMIN_ASSISTANT_ACTIONS[id];
  return { riskLevel: def.riskLevel, requiresConfirm: def.requiresConfirm, confirmLabel: def.confirmLabel };
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
  adminUserId: string,
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

  if (id === "dismiss-knowledge-gap") {
    const p = params as { gapId: string; note?: string };
    const gapId = p.gapId.trim();
    if (!gapId) return { ok: false, httpStatus: 400, error: "gapId non valido" };
    const rows = await db
      .update(aiKnowledgeGaps)
      .set({ status: "dismissed", resolutionNote: p.note ?? null })
      .where(eq(aiKnowledgeGaps.id, gapId))
      .returning({ id: aiKnowledgeGaps.id, question: aiKnowledgeGaps.question });
    if (rows.length === 0) return { ok: false, httpStatus: 404, error: "Lacuna non trovata" };
    console.info(`[admin-ai-action] dismiss-knowledge-gap id=${gapId}`);
    return {
      ok: true,
      summary: `Lacuna di conoscenza scartata.`,
      data: { gapId, status: "dismissed" },
    };
  }

  if (id === "vps-exec") {
    const p = params as { command: string; sudo?: boolean; confirmDestructive?: boolean };
    if (isDestructiveCommand(p.command) && p.confirmDestructive !== true) {
      return {
        ok: false,
        httpStatus: 400,
        error: "Comando distruttivo: richiede doppia conferma (confirmDestructive=true).",
      };
    }
    const res = await execVpsCommand(p.command, { sudo: p.sudo === true });
    console.info(`[admin-ai-action] vps-exec ok=${res.ok} sudo=${p.sudo === true}`);
    return {
      ok: true,
      summary: res.ok
        ? `Comando eseguito sul VPS.\n\n${res.output || "(nessun output)"}`
        : `Il comando VPS è terminato con errore.\n\n${res.output}`,
      data: { executed: res.ok },
    };
  }

  if (id === "vps-start-job") {
    const p = params as { command: string; label?: string; confirmDestructive?: boolean };
    if (isDestructiveCommand(p.command) && p.confirmDestructive !== true) {
      return {
        ok: false,
        httpStatus: 400,
        error: "Comando distruttivo: richiede doppia conferma (confirmDestructive=true).",
      };
    }
    const res = await startVpsJob({ adminUserId, command: p.command, label: p.label });
    if (!res.ok) return { ok: false, httpStatus: 502, error: `Avvio job VPS fallito: ${res.error}` };
    console.info(`[admin-ai-action] vps-start-job id=${res.job.id}`);
    return {
      ok: true,
      summary: `Job VPS avviato (id ${res.job.id}). Ti avviserò quando è pronto; puoi anche chiedermi lo stato.`,
      data: { jobId: res.job.id, status: res.job.status },
    };
  }

  if (id === "horus-analyze-now") {
    const result = await runHorusAnalysisNow();
    console.info(`[admin-ai-action] horus-analyze-now ran=${result.ran} reason=${result.reason ?? "-"}`);
    return {
      ok: true,
      summary: result.ran
        ? "Ciclo di analisi Horus completato: report salvato (DB + logs/horus-analysis-*.md)."
        : `Ciclo di analisi Horus non eseguito: ${result.reason ?? "motivo sconosciuto"}.`,
      data: result,
    };
  }

  if (id === "horus-scan-code-db") {
    const res = await startHorusScan("analysis");
    console.info(`[admin-ai-action] horus-scan-code-db started=${res.started} reason=${res.reason ?? "-"}`);
    return {
      ok: true,
      summary: res.started
        ? "Scansione completa codice+DB avviata: Horus procede da solo a lotti (i file invariati vengono saltati) e al termine produrrà proposte azionabili. Chiedimi \"stato scansioni Horus\" per l'avanzamento."
        : `Scansione non avviata: ${res.reason}.`,
      data: res,
    };
  }

  if (id === "horus-generate-manual") {
    const res = await startHorusScan("manual");
    console.info(`[admin-ai-action] horus-generate-manual started=${res.started} reason=${res.reason ?? "-"}`);
    return {
      ok: true,
      summary: res.started
        ? "Generazione manuale avviata: Horus legge l'app e comporrà il manuale (salvato nello storage di Nadir e reindicizzato, versione precedente conservata). Chiedimi \"stato scansioni Horus\" per l'avanzamento."
        : `Generazione non avviata: ${res.reason}.`,
      data: res,
    };
  }

  if (id === "horus-scan-status") {
    const all = getAllHorusScanStatus();
    return {
      ok: true,
      summary: formatScanStatusText(),
      data: all,
    };
  }

  if (id === "horus-code-review") {
    const p = params as { files: string[] };
    if (!isGithubContextConfigured("horus")) {
      return { ok: false, httpStatus: 400, error: "Contesto GitHub non configurato (HORUS_GITHUB_TOKEN mancante)." };
    }
    const code = await fetchCodeContextForFiles(p.files, "horus", "[CODICE SORGENTE — revisione Horus, GitHub main]");
    if (!code) return { ok: false, httpStatus: 404, error: "Nessuno dei file richiesti è stato recuperato da GitHub." };
    console.info(`[admin-ai-action] horus-code-review files=${p.files.join(",")}`);
    return {
      ok: true,
      summary: `Codice recuperato per ${p.files.length} file. Chiedi a Horus di rivederlo: incollerò il contenuto nel prossimo turno.\n\n${code.slice(0, 3000)}`,
      data: { files: p.files },
    };
  }

  if (id === "ares-analyze-app" || id === "ares-generate-manual") {
    const mode: AresJobMode = id === "ares-analyze-app" ? "analysis" : "manual";
    const label = mode === "analysis" ? "analisi completa codice+DB" : "generazione manuale";
    const res = await startAresJob(mode, { trigger: "admin-action", startedBy: adminUserId });
    console.info(`[admin-ai-action] ${id} started=${res.started} reason=${res.reason ?? "-"}`);
    if (!res.started) {
      return { ok: false, httpStatus: 409, error: res.reason ?? `Job ${label} non avviato.` };
    }
    return {
      ok: true,
      summary: `Ares ha avviato la ${label} in background. È un lavoro lungo, procede da solo: chiedimi "stato job Ares" quando vuoi.`,
      data: { mode, started: true },
    };
  }

  if (id === "ares-job-status") {
    const p = params as { mode?: AresJobMode };
    const modes: AresJobMode[] = p.mode ? [p.mode] : ["analysis", "manual"];
    const lines: string[] = [];
    const data: Record<string, unknown> = {};
    for (const mode of modes) {
      const st = await getAresJobStatus(mode);
      data[mode] = st;
      const label = mode === "analysis" ? "Analisi codice+DB" : "Manuale";
      let line = `${label}: ${st.status}`;
      if (st.status === "running") {
        line += ` (${st.cursor}/${st.totalChunks} lotti, ${st.processedFiles}/${st.totalFiles} file)`;
      }
      if (st.status === "failed" && st.error) line += ` — ${st.error}`;
      if (st.status === "completed") {
        if (mode === "analysis" && st.report) {
          line += ` — proposte pronte:\n${st.report.slice(0, 1500)}`;
        } else if (mode === "manual") {
          line += ` — manuale aggiornato (${st.manualLength ?? 0} caratteri), reindicizzato=${st.reindexed ? "sì" : "no"}. Consultabilità: pannello Nadir.`;
        }
      }
      lines.push(line);
    }
    return { ok: true, summary: lines.join("\n\n"), data };
  }

  if (id === "vps-job-status") {
    const p = params as { jobId: string };
    const job = await getVpsJob(p.jobId.trim());
    if (!job) return { ok: false, httpStatus: 404, error: "Job VPS non trovato" };
    if (job.adminUserId !== adminUserId) {
      return { ok: false, httpStatus: 403, error: "Questo job appartiene a un altro admin." };
    }
    const parts = [`Job ${job.id.slice(0, 8)} — stato: ${job.status}`];
    if (job.label) parts.push(`label: ${job.label}`);
    if (job.exitCode != null) parts.push(`exit: ${job.exitCode}`);
    if (job.errorMessage) parts.push(`errore: ${job.errorMessage}`);
    if (job.resultSummary) parts.push(`\n${job.resultSummary}`);
    else if (job.status === "running") parts.push("\nAncora in esecuzione.");
    return { ok: true, summary: parts.join("\n"), data: { jobId: job.id, status: job.status } };
  }

  return { ok: false, httpStatus: 400, error: "Azione admin non implementata" };
}
