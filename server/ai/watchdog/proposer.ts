// Task #2533 — AI Proposer: dato uno snapshot con problems "high/critical" non
// risolvibili da auto-fix sicuro, chiede all'AI di proporre 1-3 azioni rischiose
// per approvazione admin. NIENTE esecuzione automatica.
import { runWithFallback, resolveModel, estimateCostUsd, tryBuildOllama, generateStructured } from "../moderation/provider";
import { withBudget } from "../moderation/budget";
import { logAiCall } from "../moderation/log";
import { writeWatchdogLog } from "./log";
import { proposalSchema, classifyProposal, type HealthSnapshot, type Proposal } from "./types";
import { z } from "zod";
import type { AiCallMeta } from "../moderation/types";
import { isWatchdogEnabled } from "./kill-switch";
import { isMapsFlagEnabled } from "./maps-kill-switch";
import { isThinkCentreIgnoredForTests } from "../../lib/thinkcentre-ignore-tests";
import { storage } from "../../storage";
import { logAiUsage } from "../audit";

const SYSTEM = `Sei l'AI proposer del watchdog BikerLink. Analizza i problemi e proponi 1-3 azioni di rimedio.
REGOLE:
- Ogni proposta è UNA BOZZA che richiede approvazione admin. NON viene eseguita.
- Sii conservativo: preferisci "manual_only" se incerto.
- Indica chiaramente il riskLevel.
- riskLevel "high" SOLO se l'azione tocca dati o riavvia componenti core.
- Rispondi in italiano, max 800 caratteri per reasoning.

PROBLEMI MAPPE (source="maps"):
- Per "routing.engine_down.*" o "health.engine.*": proporre switch a engine fallback (GraphHopper) via "manual_only", citando engine specifico.
- Per "quota.mapbox" o "quota.tomtom" >= 80%: proporre rollout temporaneo verso GraphHopper self-hosted.
- Per "client.webview_crash_5min" alto: proporre disable rendering avanzato (es. forzare LeafletRouteMap base) come hotfix.
- Per "client.tile_load_error_5min" alto: proporre switch provider tile fallback.
- Per "client.gps_lost_5min" alto: proporre verifica permission flow / suggerire push educational agli utenti.
- Per "matching.last_run_h" > 24h: proporre run manuale map-matching job.

SEGNALI DB (source="db"):
- "embeddings.hnsw_index" severity=high: l'indice vettoriale HNSW (embeddings_vec_hnsw_cosine_idx) è mancante o invalido e findSimilar() degrada a sequential scan (latenza alta sotto carico). La boot-sequence ricostruisce l'indice al primo avvio: proporre un riavvio del server con azione "restart_worker" target="server" (oppure "rebuild_index" target="embeddings_vec_hnsw_cosine_idx"), riskLevel="medium".

SEGNALI CLIENT CRITICI (source="app", metric="crash_signal.*"):
- "crash_signal.appstate_transition" severity=high: PRIORITÀ MASSIMA — loop bug AppState colpisce molti dispositivi simultaneamente. Proporre hotfix OTA urgente (es. aggiungere guard de-bounce su AppState listener), segnalare come riskLevel="high" e azione "manual_only". Citare il numero di utenti colpiti e la finestra temporale (2h).
- "crash_signal.js_thread_freeze" severity=high: proporre analisi flamegraph lato client e riduzione lavoro sul main thread.
- "crash_signal.memory_pressure" severity=high: proporre riduzione cache in-memory e verifica leak nei componenti heavy.`;

const proposalsSchema = z.object({
  proposals: z.array(proposalSchema).min(0).max(3),
});

// Metric-id patterns that identify "known offline" ThinkCentre services.
// If ALL high/critical problems match these patterns, the AI call is skipped.
const KNOWN_OFFLINE_PATTERNS: RegExp[] = [
  /^health\.engine\.(graphhopper|valhalla)/i,
  /^routing\.engine_down\.(graphhopper|valhalla)/i,
  /thinkcentre/i,
  /dns_not_resolve/i,
  /tunnel_offline/i,
  /graphhopper/i,
  /valhalla/i,
];

function isKnownOfflineProblem(problemId: string): boolean {
  return KNOWN_OFFLINE_PATTERNS.some((re) => re.test(problemId));
}

function computeProblemsFingerprint(problems: HealthSnapshot["problems"]): string {
  const ids = problems
    .filter((p) => p.severity === "high" || p.severity === "critical")
    .map((p) => p.id)
    .sort();
  return JSON.stringify(ids);
}

const FINGERPRINT_KEY = "watchdog_proposer_last_fingerprint";
const MODEL_KEY = "watchdog_proposer_model";
const DEFAULT_PROPOSER_MODEL = "llama-3.3-70b-versatile";

// Modelli Groq legacy/preview che resettiamo al default se salvati nel DB.
// NOTA (Task #4857): anche il DEFAULT_PROPOSER_MODEL (llama-3.3-70b-versatile) NON
// supporta json_schema su Groq — come tutti i llama-3.x. Non per questo va resettato:
// generateStructured() lo instrada su output:"no-schema" (JSON-object mode) + validazione
// Zod, quindi funziona. Questo set elenca solo modelli che NON vogliamo usare comunque
// (8b/preview/whisper), per ricadere sul default llama-3.3 più capace.
// Ref: https://console.groq.com/docs/structured-outputs#supported-models
const GROQ_UNSUPPORTED_STRUCTURED_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "llama-3.2-1b-preview",
  "llama-3.2-3b-preview",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
  "whisper-large-v3",
  "whisper-large-v3-turbo",
]);

let _cachedFingerprint: string | null = null;

async function getLastFingerprint(): Promise<string | null> {
  if (_cachedFingerprint !== null) return _cachedFingerprint;
  try {
    const row = await storage.getAppSetting(FINGERPRINT_KEY);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function saveFingerprint(fp: string): Promise<void> {
  _cachedFingerprint = fp;
  try {
    await storage.upsertAppSetting(FINGERPRINT_KEY, fp);
  } catch {/* best-effort */}
}

async function getProposerModel(): Promise<string> {
  try {
    const row = await storage.getAppSetting(MODEL_KEY);
    const saved = row?.value?.trim() || "";
    if (!saved) return DEFAULT_PROPOSER_MODEL;
    if (GROQ_UNSUPPORTED_STRUCTURED_MODELS.has(saved)) {
      console.warn(
        `[watchdog/proposer] modello salvato "${saved}" è legacy/preview — ` +
        `reset al default ${DEFAULT_PROPOSER_MODEL} (llama-3.x via JSON-object mode)`,
      );
      return DEFAULT_PROPOSER_MODEL;
    }
    return saved;
  } catch {
    return DEFAULT_PROPOSER_MODEL;
  }
}

export interface ProposerResult {
  proposals: Array<Proposal & { logId: string | null }>;
  meta: { provider: string; model: string; costUsd: number };
  skipped?: boolean;
  skipReason?: string;
}

export async function runProposer(snap: HealthSnapshot): Promise<ProposerResult | null> {
  if (!(await isWatchdogEnabled())) return null;
  const mapsLlmEnabled = await isMapsFlagEnabled("llm");
  let hiSev = snap.problems
    .filter((p) => p.severity === "high" || p.severity === "critical")
    .filter((p) => mapsLlmEnabled || p.source !== "maps")
    // Task #23 — il namespace "horus" (correttezza routing) ha un proposer dedicato
    // (Task #25). Escludilo qui per non generare proposte premature dal proposer generico.
    .filter((p) => p.source !== "horus");
  if (hiSev.length === 0) return null;

  // Se il flag "ThinkCentre offline per test" è attivo, rimuovi i problemi ThinkCentre
  // da hiSev prima di qualsiasi analisi: vengono soppressi silenziosamente.
  // Differenza rispetto ad allKnownOffline: qui si filtrano i singoli problemi TC anche
  // in presenza di problemi misti (i non-TC vengono comunque proposti all'AI).
  if (await isThinkCentreIgnoredForTests()) {
    const tcProblems = hiSev.filter((p) => isKnownOfflineProblem(p.id));
    if (tcProblems.length > 0) {
      hiSev = hiSev.filter((p) => !isKnownOfflineProblem(p.id));
      console.info(
        `[watchdog/proposer] ThinkCentre offline per test: rimossi ${tcProblems.length} probl. TC/routing` +
        ` (${tcProblems.map((p) => p.id).join(", ")})` +
        (hiSev.length > 0 ? ` — ${hiSev.length} problemi non-TC rimangono` : " — nessun problema rimanente, skip"),
      );
      if (hiSev.length === 0) return null;
    }
  }

  // Skip se tutti i problemi attivi sono "noti offline" (ThinkCentre/GraphHopper/Valhalla):
  // non c'è niente che possiamo fare automaticamente, evita di bruciare quota AI.
  const allKnownOffline = hiSev.every((p) => isKnownOfflineProblem(p.id));
  if (allKnownOffline) {
    console.info(
      "[watchdog/proposer] skip — problemi invariati/noti, nessuna proposta" +
      ` (${hiSev.length} problemi ThinkCentre/routing noti: ${hiSev.map((p) => p.id).join(", ")})`,
    );
    return null;
  }

  // Skip se i problemi non sono cambiati dall'ultima chiamata AI (fingerprint check).
  const currentFp = computeProblemsFingerprint(snap.problems);
  const lastFp = await getLastFingerprint();
  if (lastFp !== null && lastFp === currentFp) {
    console.info(
      `[watchdog/proposer] skip — problemi invariati/noti, nessuna proposta` +
      ` (fingerprint invariato: ${hiSev.length} problemi high/critical, stesso set della chiamata precedente)`,
    );
    return null;
  }

  const proposerModel = await getProposerModel();
  // Groq-only models (llama-*, openai/gpt-oss-*) should not be forced on Google/OpenAI.
  const isGroqOnlyModel = /^(llama-3\.|llama-3\d|meta-llama\/|openai\/gpt-oss)/i.test(proposerModel);
  const forcedModelId = isGroqOnlyModel ? undefined : proposerModel;
  const groqOverrideModelId = isGroqOnlyModel ? proposerModel : undefined;

  const prompt = [
    `Snapshot corrente: status=${snap.status} score=${snap.score}`,
    `Problemi high/critical (${hiSev.length}):`,
    ...hiSev.slice(0, 10).map((p, i) => `${i + 1}. [${p.severity}] (${p.source}) ${p.title}${p.detail ? ` — ${p.detail}` : ""}${p.suggestion ? ` Suggerimento base: ${p.suggestion}` : ""}`),
    "",
    "Proponi fino a 3 azioni concrete. Se nessuna è opportuna, ritorna proposals=[].",
  ].join("\n");

  try {
    return await withBudget("triage", async () => {
      const started = Date.now();

      // Helper: structured generation tramite generateStructured (AI SDK v6).
      // I modelli Groq llama-3.x (objectMode:"json") usano output:"no-schema" +
      // validazione Zod; gli altri usano structured outputs nativi. Vedi provider.ts.
      // Task #858 — think:false esplicito per Ollama: generateStructured ha già un
      // default think:false, ma lo rendiamo esplicito per chiarezza e robustezza.
      // Con think:true su Ollama 0.30.11 + qwen3, generateObject restituisce 400.
      const callModel = (mm: ReturnType<typeof resolveModel>) =>
        mm.scheduler(() => generateStructured(mm, {
          schema: proposalsSchema, system: SYSTEM, prompt, temperature: 0.2,
          providerOptions: { ollama: { think: false } },
        }));

      // Three-step model routing (Task #3872 — Ollama-first universale):
      // Step 0 — Ollama self-hosted (ThinkCentre, costo zero). Se configurato,
      //          prova per primo. Se offline/lento scende al passo successivo.
      // Step 1 — se il modello configurato è Groq-specifico, provalo su Groq ONLY.
      //          NON passare per la full chain: Google/OpenAI non hanno quel modello
      //          e setterebbe cooldown sbagliati.
      // Step 2 — se Groq fallisce (quota, cooldown, errore modello) o il modello
      //          è provider-agnostico, usa la chain standard (Groq → Gemini → OpenAI).
      const resolveAndCall = async (): Promise<{ value: Awaited<ReturnType<typeof callModel>>; model: ReturnType<typeof resolveModel> }> => {
        // Step 0: Ollama-first (skipOllama non impostato → tentiamo Ollama)
        {
          const om = tryBuildOllama();
          if (om) {
            try {
              const value = await callModel(om);
              console.log(`[watchdog/proposer] risposta da ollama/${om.modelId} (ollama-first)`);
              return { value, model: om };
            } catch (ollamaErr) {
              console.warn(
                `[watchdog/proposer] ollama-first fallito, scalo a chain cloud:`,
                (ollamaErr as Error).message,
              );
            }
          }
        }
        if (groqOverrideModelId) {
          try {
            const groqM = resolveModel({ role: "brain", preferredProvider: "groq", forcedModelId: groqOverrideModelId });
            return { value: await callModel(groqM), model: groqM };
          } catch (groqErr) {
            console.warn(
              `[watchdog/proposer] Groq/${groqOverrideModelId} fallito, uso chain standard:`,
              (groqErr as Error).message,
            );
            // Fall through to standard chain with default models.
          }
          const fallback = await runWithFallback({ role: "brain", skipOllama: true }, callModel);
          return { value: fallback.value, model: fallback.model };
        }
        // Provider-agnostic model: pass forcedModelId through the full chain (skipOllama:
        // true perché Ollama è già stato tentato nel Step 0 qui sopra).
        const fallback = await runWithFallback({ role: "brain", forcedModelId, skipOllama: true }, callModel);
        return { value: fallback.value, model: fallback.model };
      };
      const { value: result, model: m } = await resolveAndCall();
      const tokensIn = result.usage?.inputTokens ?? Math.ceil(prompt.length / 4);
      const tokensOut = result.usage?.outputTokens ?? 200;
      const meta: AiCallMeta = {
        provider: m.providerName, model: m.modelId, tokensIn, tokensOut,
        costUsd: estimateCostUsd(m.modelId, tokensIn, tokensOut),
        durationMs: Date.now() - started,
      };
      await logAiCall({
        scope: "anomaly", prompt: prompt.slice(0, 4000),
        response: JSON.stringify(result.object).slice(0, 4000),
        suggestion: result.object, meta,
      });
      await logAiUsage("proposer", m.modelId, { tokensIn, tokensOut }, "scheduler");
      await saveFingerprint(currentFp);
      const proposals = result.object.proposals;
      const withIds: Array<Proposal & { logId: string | null }> = [];
      for (const p of proposals) {
        const logId = await writeWatchdogLog({
          kind: "proposal", scope: p.action.kind, status: "pending",
          // Task #158 — actionType/actionLabel per la card admin (classificazione keyword).
          summary: p.title, details: { ...p, ...classifyProposal(`${p.title}. ${p.reasoning}`) },
          costUsd: meta.costUsd / Math.max(1, proposals.length),
        });
        withIds.push({ ...p, logId });
      }
      return { proposals: withIds, meta: { provider: m.providerName, model: m.modelId, costUsd: meta.costUsd } };
    });
  } catch (err) {
    const msg = (err as Error).message ?? "errore";
    if (msg.startsWith("AI_BUDGET_EXCEEDED")) {
      console.warn("[watchdog/proposer] budget esaurito, skip proposer");
      return null;
    }
    console.warn("[watchdog/proposer] error:", msg);
    return null;
  }
}

export async function getProposerSettings(): Promise<{ model: string; defaultModel: string }> {
  return { model: await getProposerModel(), defaultModel: DEFAULT_PROPOSER_MODEL };
}

export async function setProposerModel(model: string): Promise<void> {
  await storage.upsertAppSetting(MODEL_KEY, model.trim());
}

/** Esposto solo per i test — azzera il fingerprint in-process tra i test. */
export function _resetProposerForTests(): void {
  _cachedFingerprint = null;
}
