// Task #2532 — Budget mensile AI. Default 50€ (~55$), alert 80%, freeze chat al 100%.
import { db } from "../../db";
import { aiUsageBudget } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendAiBudgetAlertPush } from "./push";

export interface BudgetStatus {
  month: string;
  totalCostUsd: number;
  limitUsd: number;
  pct: number;
  state: "ok" | "warn" | "frozen";
  alertSent80: boolean;
  alertSent100: boolean;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function ensureRow(month: string) {
  const [existing] = await db.select().from(aiUsageBudget).where(eq(aiUsageBudget.month, month));
  if (existing) return existing;
  const [created] = await db
    .insert(aiUsageBudget)
    .values({ month, totalCostUsd: "0", limitUsd: "55" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [retry] = await db.select().from(aiUsageBudget).where(eq(aiUsageBudget.month, month));
  return retry;
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const month = currentMonth();
  const row = await ensureRow(month);
  const total = parseFloat(row.totalCostUsd as unknown as string);
  const limit = parseFloat(row.limitUsd as unknown as string);
  const pct = limit > 0 ? total / limit : 0;
  const state: BudgetStatus["state"] = pct >= 1 ? "frozen" : pct >= 0.8 ? "warn" : "ok";
  return {
    month, totalCostUsd: total, limitUsd: limit, pct,
    state, alertSent80: row.alertSent80, alertSent100: row.alertSent100,
  };
}

export async function addCost(usd: number): Promise<BudgetStatus> {
  if (!Number.isFinite(usd) || usd <= 0) return getBudgetStatus();
  const month = currentMonth();
  await ensureRow(month);
  await db.execute(
    (await import("drizzle-orm")).sql`UPDATE ai_usage_budget SET total_cost_usd = total_cost_usd + ${usd}, updated_at = NOW() WHERE month = ${month}`,
  );
  const status = await getBudgetStatus();
  // Alerts (best-effort, non-fatal).
  try {
    if (status.pct >= 1 && !status.alertSent100) {
      await db.update(aiUsageBudget).set({ alertSent100: true }).where(eq(aiUsageBudget.month, month));
      sendAiBudgetAlertPush({ level: 100, pct: status.pct, totalUsd: status.totalCostUsd, limitUsd: status.limitUsd }).catch(() => {});
    } else if (status.pct >= 0.8 && !status.alertSent80) {
      await db.update(aiUsageBudget).set({ alertSent80: true }).where(eq(aiUsageBudget.month, month));
      sendAiBudgetAlertPush({ level: 80, pct: status.pct, totalUsd: status.totalCostUsd, limitUsd: status.limitUsd }).catch(() => {});
    }
  } catch (err) {
    console.warn("[ai-budget] alert error (non-fatal):", err);
  }
  return status;
}

export async function setBudgetLimit(usd: number): Promise<BudgetStatus> {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("limit usd invalido");
  const month = currentMonth();
  await ensureRow(month);
  await db.update(aiUsageBudget).set({ limitUsd: String(usd), alertSent80: false, alertSent100: false }).where(eq(aiUsageBudget.month, month));
  return getBudgetStatus();
}

// Wrapper: blocca le chiamate "chat" e degrada "triage" se budget esaurito.
export async function withBudget<T>(
  scope: "chat" | "triage" | "digest" | "anomaly",
  fn: () => Promise<T>,
): Promise<T> {
  const status = await getBudgetStatus();
  if (status.state === "frozen" && scope === "chat") {
    throw new Error("AI_BUDGET_EXCEEDED: chat copilot disabilitata fino al rinnovo del budget mensile");
  }
  if (status.state === "frozen" && scope === "triage") {
    throw new Error("AI_BUDGET_EXCEEDED_TRIAGE: triage degradata a rule-based");
  }
  return fn();
}
