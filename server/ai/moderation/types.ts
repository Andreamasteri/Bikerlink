// Task #2532 — Tipi condivisi per il Co-Pilot AI Moderazione.
import { z } from "zod";

export const REPORT_AI_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const REPORT_AI_CATEGORIES = [
  "aggressive", "harassment", "fake_profile", "no_show",
  "opportunist", "group_misconduct", "dangerous_riding", "other",
] as const;

export const triageOutputSchema = z.object({
  severitySuggested: z.enum(REPORT_AI_SEVERITIES),
  categorySuggested: z.enum(REPORT_AI_CATEGORIES),
  isSpamProbability: z.number().min(0).max(1),
  isRetaliatoryProbability: z.number().min(0).max(1),
  similarReports: z.array(z.object({
    id: z.string(),
    similarity: z.number().min(0).max(1),
    reason: z.string().max(200),
  })).max(10).default([]),
  summary: z.string().max(280),
  suggestedAction: z.enum(["none", "warn", "shadow_ban", "ban_temp", "ban_perm", "dismiss"]),
  suggestedBanDays: z.number().int().min(0).max(365).default(0),
  reasoning: z.string().max(500),
  confidence: z.number().min(0).max(1),
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;

export interface AiCallMeta {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
}

export type AiProviderId = "openai" | "google" | "groq";

export interface AiProviderHealth {
  id: AiProviderId;
  available: boolean;
  lastError?: string;
  lastErrorAt?: string;
  cooldownRemainingMs?: number;
  isQuotaError?: boolean;
}
