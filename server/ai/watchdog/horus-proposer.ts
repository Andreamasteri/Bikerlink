// Task #25 — Proposer di ROUTING dedicato a Horus.
//
// Il proposer generico (proposer.ts) ESCLUDE il namespace "horus" (correttezza
// routing/geocoding): quei problemi vengono gestiti QUI, generando la proposta di
// correzione attraverso la PERSONA e il MODELLO di Horus (Ollama sul ThinkCentre,
// stesso modello che usa in chat) con un prompt dedicato all'interpretazione dei
// log di routing — non il prompt generico del watchdog.
//
// La proposta è scritta con lo STESSO meccanismo delle altre (writeWatchdogLog,
// kind:"proposal", status:"pending") così appare automaticamente nel pannello
// admin esistente; l'unica differenza è la firma persona:"horus" nei details,
// che la UI usa per attribuirla a Horus.
//
// Nessuna esecuzione automatica: come tutte le proposte, richiede approvazione admin.
import { runWithFallback, estimateCostUsd, generateStructured, type ResolvedModel } from "../moderation/provider";
import { withBudget } from "../moderation/budget";
import { logAiCall } from "../moderation/log";
import { writeWatchdogLog } from "./log";
import { proposalSchema, type HealthSnapshot, type Problem, type Proposal } from "./types";
import { z } from "zod";
import type { AiCallMeta } from "../moderation/types";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { isWatchdogEnabled } from "./kill-switch";
import { isThinkCentreIgnoredForTests } from "../../lib/thinkcentre-ignore-tests";
import { isThinkCentreOffline } from "../../lib/thinkcentre-offline";
import { getOllamaModel, isOllamaConfigured } from "../../lib/ollama-client";
import { storage } from "../../storage";
import { logAiUsage } from "../audit";

// Modello Ollama di Horus (stesso default di agent.ts): qwen3:4b sul ThinkCentre.
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b";

// Prompt DEDICATO all'interpretazione dei log di routing (voce di Horus).
export const HORUS_PROPOSER_SYSTEM = `Sei Horus, lo specialista di routing e navigazione di BikerLink, in modalità diagnostica.
Il watchdog ha rilevato problemi di CORRETTEZZA su uno o più motori di routing/geocoding self-hosted (GraphHopper, Valhalla, Photon) o sulla pipeline combinata.
Il tuo compito è LEGGERE i log/segnali di routing forniti e proporre 1-3 azioni concrete di rimedio per l'amministratore.

CONTESTO ARCHITETTURA ROUTING (usalo per interpretare i segnali):
- GraphHopper e Valhalla girano sul ThinkCentre (server di casa). Valhalla è il motore primario per alcuni profili; se non è corretto, il fallback è GraphHopper.
- Photon è il geocoder self-hosted (ricerca luoghi). Se risponde ma restituisce risultati vuoti/errati, l'indice o la connettività sono in dubbio.
- "correttezza KO" = il motore risponde (raggiungibile) ma il percorso/geocoding è implausibile o è un errore silenzioso (200 con corpo incoerente): è PEGGIO di un semplice down, perché serve dati sbagliati agli utenti.
- "pipeline" = esito combinato: se un motore copre via fallback il sistema è degradato ma funzionale; se nessun motore serve percorsi corretti la pipeline è rotta.

REGOLE:
- Ogni proposta è UNA BOZZA che richiede approvazione admin. NON viene eseguita in automatico.
- Interpreta i dettagli reali (latenza, distanza/durata, plausibile, raggiungibile, errori recenti) e citali nel reasoning: la proposta deve essere COERENTE con i log, non generica.
- Distingui "irraggiungibile" (probabile TC spento/tunnel giù → azione manuale di verifica infrastruttura) da "raggiungibile ma incorretto" (probabile grafo/tile/indice corrotto → rebuild/verifica dati).
- Sii conservativo: preferisci "manual_only" quando l'azione richiede intervento umano sul ThinkCentre (rebuild grafo, verifica tile/indice, riavvio container).
- riskLevel "high" SOLO se l'azione tocca dati o riavvia componenti core.
- Rispondi in italiano, max 800 caratteri per reasoning.`;

const proposalsSchema = z.object({
  proposals: z.array(proposalSchema).min(0).max(3),
});

const FINGERPRINT_KEY = "watchdog_horus_proposer_last_fingerprint";

let _cachedFingerprint: string | null = null;

/** Filtra i problemi del namespace Horus (routing/geocoding) high/critical. */
export function filterHorusProblems(problems: Problem[]): Problem[] {
  return problems.filter(
    (p) =>
      (p.source === "horus" || p.id.startsWith("horus.")) &&
      (p.severity === "high" || p.severity === "critical"),
  );
}

function computeFingerprint(problems: Problem[]): string {
  return JSON.stringify(filterHorusProblems(problems).map((p) => p.id).sort());
}

/** Costruisce il prompt utente coi log/segnali di routing reali. Puro (testabile). */
export function buildHorusProposerPrompt(problems: Problem[], snap: HealthSnapshot): string {
  const horus = filterHorusProblems(problems);
  return [
    `Snapshot corrente: status=${snap.status} score=${snap.score}`,
    `Problemi di routing/geocoding high/critical (${horus.length}):`,
    ...horus.slice(0, 10).map((p, i) =>
      `${i + 1}. [${p.severity}] ${p.title}` +
      `${p.detail ? `\n   Log/segnale: ${p.detail}` : ""}` +
      `${p.suggestion ? `\n   Nota base: ${p.suggestion}` : ""}`,
    ),
    "",
    "Proponi fino a 3 azioni concrete e coerenti con i log qui sopra. Se nessuna è opportuna, ritorna proposals=[].",
  ].join("\n");
}

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

/** Solo per i test: azzera il fingerprint cachato in-process. */
export function _resetHorusProposerForTests(): void {
  _cachedFingerprint = null;
}

// Costruisce il model handle di Horus (Ollama self-hosted, modello dedicato).
// Ritorna null se Ollama non è configurato: il chiamante ricade sulla chain cloud.
function tryBuildHorusOllama(): ResolvedModel | null {
  if (!isOllamaConfigured) return null;
  try {
    const model = getOllamaModel(HORUS_MODEL_ID, "horus") as unknown as LanguageModelV2;
    return {
      id: "ollama",
      providerName: "ollama",
      modelId: HORUS_MODEL_ID,
      model,
      scheduler: <T>(fn: () => Promise<T>) => fn(),
    };
  } catch {
    return null;
  }
}

export interface HorusProposerResult {
  proposals: Array<Proposal & { logId: string | null }>;
  meta: { provider: string; model: string; costUsd: number };
}

/**
 * Genera proposte di correzione per i problemi di routing (namespace Horus).
 * Prova PRIMA il modello di Horus (Ollama sul ThinkCentre) e, se non disponibile
 * o in errore, ricade sulla chain cloud (Groq→Gemini→OpenAI). La proposta è
 * firmata persona:"horus" nei details così la UI la attribuisce a Horus.
 */
export async function runHorusRoutingProposer(snap: HealthSnapshot): Promise<HorusProposerResult | null> {
  if (!(await isWatchdogEnabled())) return null;

  const horus = filterHorusProblems(snap.problems);
  if (horus.length === 0) return null;

  // Se il ThinkCentre è marcato offline per i test, i problemi di routing sono
  // attesi (motori spenti) → nessuna proposta, evita di bruciare quota AI.
  if (await isThinkCentreIgnoredForTests()) {
    console.info("[watchdog/horus-proposer] ThinkCentre offline per test: skip proposte routing");
    return null;
  }

  // Fingerprint: non rigenerare se il set di problemi routing è invariato.
  const currentFp = computeFingerprint(snap.problems);
  const lastFp = await getLastFingerprint();
  if (lastFp !== null && lastFp === currentFp) {
    console.info(
      `[watchdog/horus-proposer] skip — problemi routing invariati (${horus.length} high/critical, stesso set)`,
    );
    return null;
  }

  const prompt = buildHorusProposerPrompt(snap.problems, snap);

  try {
    return await withBudget("triage", async () => {
      const started = Date.now();

      const callModel = (mm: ResolvedModel) =>
        mm.scheduler(() => generateStructured(mm, {
          schema: proposalsSchema,
          system: HORUS_PROPOSER_SYSTEM,
          prompt,
          temperature: 0.2,
          // qwen3:4b "pensa" di default: disattiviamo il ragionamento esplicito
          // per non corrompere il JSON strutturato (innocuo per gli altri modelli).
          providerOptions: { ollama: { think: false } },
        }));

      // Step 0 — modello di Horus (Ollama sul ThinkCentre). Se TC è offline o il
      // modello locale fallisce, scala alla chain cloud.
      const resolveAndCall = async (): Promise<{ value: Awaited<ReturnType<typeof callModel>>; model: ResolvedModel }> => {
        if (!(await isThinkCentreOffline())) {
          const hm = tryBuildHorusOllama();
          if (hm) {
            try {
              const value = await callModel(hm);
              console.log(`[watchdog/horus-proposer] risposta da ollama/${hm.modelId} (Horus)`);
              return { value, model: hm };
            } catch (ollamaErr) {
              console.warn(
                `[watchdog/horus-proposer] Horus/Ollama fallito, scalo a chain cloud:`,
                (ollamaErr as Error).message,
              );
            }
          }
        }
        // Fallback cloud (Ollama già tentato/saltato sopra → skipOllama).
        const fallback = await runWithFallback({ role: "brain", skipOllama: true }, callModel);
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
      await logAiUsage("horus-proposer", m.modelId, { tokensIn, tokensOut }, "scheduler");
      await saveFingerprint(currentFp);

      const proposals = result.object.proposals;
      const withIds: Array<Proposal & { logId: string | null }> = [];
      for (const p of proposals) {
        const logId = await writeWatchdogLog({
          kind: "proposal", scope: p.action.kind, status: "pending",
          summary: p.title,
          // Firma Horus: la UI mostra il badge se details.persona === "horus".
          details: { ...p, persona: "horus" },
          costUsd: meta.costUsd / Math.max(1, proposals.length),
        });
        withIds.push({ ...p, logId });
      }
      return { proposals: withIds, meta: { provider: m.providerName, model: m.modelId, costUsd: meta.costUsd } };
    });
  } catch (err) {
    const msg = (err as Error).message ?? "errore";
    if (msg.startsWith("AI_BUDGET_EXCEEDED")) {
      console.warn("[watchdog/horus-proposer] budget esaurito, skip");
      return null;
    }
    console.warn("[watchdog/horus-proposer] error:", msg);
    return null;
  }
}
