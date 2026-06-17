export type NotificationPriority = "urgent" | "high" | "normal" | "low";

export interface ClassifyInput {
  isSupermatch?: boolean;
  score?: number | null;
  distanceKm?: number | null;
  isFreshProposal?: boolean;
  matchKind?: "biker_biker" | "biker_zavorrina" | "proposal" | "proposal_profile";
}

/**
 * Rule-based classifier per la priorità di notifica di un match.
 * - urgent: Supermatch + distanza < 10 km, oppure score >= 0.95,
 *           oppure proposta fresca + distanza < 25 km (push immediato)
 * - high:   Supermatch, oppure score >= 0.85
 * - normal: default per la maggioranza dei match
 * - low:    distanza > 100 km e score basso (< 0.4)
 */
export function classifyMatch(input: ClassifyInput): NotificationPriority {
  const score = typeof input.score === "number" ? input.score : null;
  const dist = typeof input.distanceKm === "number" ? input.distanceKm : null;

  if (input.isSupermatch && dist !== null && dist < 10) return "urgent";
  if (score !== null && score >= 0.95) return "urgent";

  if (input.isFreshProposal && dist !== null && dist < 25) return "urgent";

  if (input.isSupermatch) return "high";
  if (score !== null && score >= 0.85) return "high";

  if (dist !== null && dist > 100 && (score === null || score < 0.4)) return "low";

  return "normal";
}

export function priorityRank(p: NotificationPriority): number {
  switch (p) {
    case "urgent": return 0;
    case "high": return 1;
    case "normal": return 2;
    case "low": return 3;
  }
}
