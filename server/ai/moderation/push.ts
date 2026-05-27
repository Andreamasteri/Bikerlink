// Task #2532 — Helper push per alert AI moderazione (budget, anomalie, digest).
// Tenuto separato per evitare cicli di import con push-notifications.ts principale.
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
}

async function sendToAdmins(makeMsg: (token: string) => ExpoPushMessage): Promise<number> {
  try {
    const rows = await db
      .select({ token: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));
    const msgs: ExpoPushMessage[] = [];
    for (const r of rows) {
      const t = r.token;
      if (t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))) {
        msgs.push(makeMsg(t));
      }
    }
    if (msgs.length === 0) return 0;
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(msgs),
    });
    if (!resp.ok) console.warn("[ai-push] HTTP", resp.status);
    return msgs.length;
  } catch (err) {
    console.warn("[ai-push] error (non-fatal):", err);
    return 0;
  }
}

export async function sendAiBudgetAlertPush(opts: {
  level: 80 | 100;
  pct: number;
  totalUsd: number;
  limitUsd: number;
}): Promise<void> {
  const icon = opts.level === 100 ? "🛑" : "⚠️";
  const title = opts.level === 100
    ? `${icon} Budget AI esaurito (100%)`
    : `${icon} Budget AI all'${Math.round(opts.pct * 100)}%`;
  const body = `Speso $${opts.totalUsd.toFixed(2)} / $${opts.limitUsd.toFixed(2)}`;
  await sendToAdmins((to) => ({
    to, title, body, sound: "default", channelId: "matches",
    data: { type: "ai_budget_alert", level: opts.level, pct: opts.pct },
  }));
}

export async function sendAiAnomalyAlertPush(opts: {
  type: string;
  category?: string | null;
  observed: number;
  threshold: number;
}): Promise<void> {
  const cat = opts.category ? ` (${opts.category})` : "";
  await sendToAdmins((to) => ({
    to,
    title: `🚨 Anomalia segnalazioni${cat}`,
    body: `Osservati ${opts.observed} eventi, soglia ${opts.threshold.toFixed(1)}`,
    sound: "default",
    channelId: "matches",
    data: { type: "ai_anomaly", anomalyType: opts.type, category: opts.category, observed: opts.observed },
  }));
}

export async function sendDigestPush(token: string, top: number): Promise<void> {
  try {
    if (!(token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))) return;
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify([{
        to: token, title: "📋 Digest moderazione",
        body: `${top} casi prioritari da rivedere oggi`,
        sound: "default", channelId: "matches",
        data: { type: "ai_digest" },
      }]),
    });
  } catch (err) {
    console.warn("[ai-push] digest error (non-fatal):", err);
  }
}
