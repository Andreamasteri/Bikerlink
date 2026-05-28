// Task #2649 — Tipi condivisi per il Layer AI Coordinato.
import { z } from "zod";

export const SEVERITIES = ["debug", "info", "warn", "critical"] as const;
export type Severity = typeof SEVERITIES[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  critical: 3,
};

export const POLICY_ACTIONS = ["BLOCK", "ALLOW", "DELAY", "NOTIFY"] as const;
export type PolicyAction = typeof POLICY_ACTIONS[number];

export const AiEventInputSchema = z.object({
  aiName: z.string().min(1).max(80),
  eventType: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).default({}),
  severity: z.enum(SEVERITIES).default("info"),
  correlationId: z.string().min(1).max(80).optional(),
});
export type AiEventInput = z.infer<typeof AiEventInputSchema>;

export const AiDecisionInputSchema = z.object({
  aiName: z.string().min(1).max(80),
  decisionType: z.string().min(1).max(80),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().max(8000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tookMs: z.number().int().min(0).max(3_600_000).default(0),
  correlationId: z.string().min(1).max(80).optional(),
});
export type AiDecisionInput = z.infer<typeof AiDecisionInputSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  priority: z.number().int().min(0).max(10_000).default(0),
  conflictType: z.string().min(1).max(80).optional(), // se presente → regola per conflitti
  when: z.object({
    aiName: z.string().min(1).max(80).optional(),
    eventType: z.string().min(1).max(80).optional(),
    severityGte: z.enum(SEVERITIES).optional(),
  }).default({}),
  then: z.object({
    action: z.enum(POLICY_ACTIONS),
    target: z.string().min(1).max(160).optional(),
    message: z.string().max(400).default(""),
  }),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyFileSchema = z.object({
  version: z.number().int().min(1).default(1),
  rules: z.array(PolicyRuleSchema).default([]),
});
export type PolicyFile = z.infer<typeof PolicyFileSchema>;

export interface PolicyEvaluation {
  matched: boolean;
  ruleId: string | null;
  action: PolicyAction;
  message: string;
  rationale: string;
}

export interface ConflictResolution {
  conflictId: string;
  resolvedBy: "policy" | "admin" | "none";
  policyRuleId: string | null;
  action: PolicyAction;
  rationale: string;
}

export interface CoordinatorSubscription {
  unsubscribe(): Promise<void>;
}
