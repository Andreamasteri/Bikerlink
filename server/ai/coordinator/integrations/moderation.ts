// Task #2654 — Adapter Moderation → AI Coordinator (b).
import { getCoordinator } from "../index";

const AI_NAME = "moderation";

interface SuggestionLike {
  suggestedAction: string;
  severitySuggested: string;
  categorySuggested?: string;
  confidence?: number;
  isSpamProbability?: number;
  isRetaliatoryProbability?: number;
}

export async function emitModerationSuggestion(args: {
  reportId: string;
  reportedUserId: string;
  reporterId: string;
  suggestion: SuggestionLike;
  modelId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    const severity = mapSeverity(args.suggestion.severitySuggested);
    await c.emit({
      aiName: AI_NAME,
      eventType: "decision_proposed",
      payload: {
        reportId: args.reportId,
        reportedUserId: args.reportedUserId,
        reporterId: args.reporterId,
        suggestedAction: args.suggestion.suggestedAction,
        severitySuggested: args.suggestion.severitySuggested,
        category: args.suggestion.categorySuggested ?? null,
        confidence: args.suggestion.confidence ?? null,
        spamProbability: args.suggestion.isSpamProbability ?? null,
        retaliatoryProbability: args.suggestion.isRetaliatoryProbability ?? null,
        modelId: args.modelId ?? null,
      },
      severity,
      correlationId: `report-${args.reportId.slice(0, 12)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/moderation] emit fallback:`, (err as Error).message);
  }
}

function mapSeverity(s: string): "debug" | "info" | "warn" | "critical" {
  switch ((s ?? "").toLowerCase()) {
    case "critical": return "critical";
    case "high": return "warn";
    case "medium": return "info";
    case "low": return "debug";
    default: return "info";
  }
}

export function wireModerationToCoordinator(): void {
  console.log("[INIT] AI Coordinator wire moderation");
}
