// Task #2533 — AI Proposer: dato uno snapshot con problems "high/critical" non
// risolvibili da auto-fix sicuro, chiede all'AI di proporre 1-3 azioni rischiose
// per approvazione admin. NIENTE esecuzione automatica.
import { generateObject } from "ai";
import { runWithFallback, estimateCostUsd } from "../moderation/provider";
import { withBudget } from "../moderation/budget";
import { logAiCall } from "../moderation/log";
import { writeWatchdogLog } from "./log";
import { proposalSchema, type HealthSnapshot, type Proposal } from "./types";
import { z } from "zod";
import type { AiCallMeta } from "../moderation/types";
import { isWatchdogEnabled } from "./kill-switch";

const SYSTEM = `Sei l'AI proposer del watchdog BikerLink. Analizza i problemi e proponi 1-3 azioni di rimedio.
REGOLE:
- Ogni proposta è UNA BOZZA che richiede approvazione admin. NON viene eseguita.
- Sii conservativo: preferisci "manual_only" se incerto.
- Indica chiaramente il riskLevel.
- riskLevel "high" SOLO se l'azione tocca dati o riavvia componenti core.
- Rispondi in italiano, max 800 caratteri per reasoning.`;

const proposalsSchema = z.object({
  proposals: z.array(proposalSchema).min(0).max(3),
});

export interface ProposerResult {
  proposals: Array<Proposal & { logId: string | null }>;
  meta: { provider: string; model: string; costUsd: number };
}

export async function runProposer(snap: HealthSnapshot): Promise<ProposerResult | null> {
  if (!(await isWatchdogEnabled())) return null;
  const hiSev = snap.problems.filter((p) => p.severity === "high" || p.severity === "critical");
  if (hiSev.length === 0) return null;

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
      const { value: result, model: m } = await runWithFallback({ role: "brain" }, (mm) =>
        mm.scheduler(() => generateObject({
          model: mm.model, schema: proposalsSchema, system: SYSTEM, prompt, temperature: 0.2,
        })),
      );
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
      const proposals = result.object.proposals;
      const withIds: Array<Proposal & { logId: string | null }> = [];
      for (const p of proposals) {
        const logId = await writeWatchdogLog({
          kind: "proposal", scope: p.action.kind, status: "pending",
          summary: p.title, details: p, costUsd: meta.costUsd / Math.max(1, proposals.length),
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
