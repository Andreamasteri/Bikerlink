// Task #2654 — Adapter AI Console → AI Coordinator (b).
// Read-only audit: ogni interazione admin produce un evento per correlazione.
import { getCoordinator } from "../index";
import { registerGatedJob } from "../gated-job";

const AI_NAME = "console";

export async function emitConsoleQuery(args: {
  adminId: string;
  scopes: string[];
  queryPreview: string;
  cached: boolean;
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "admin_query",
      payload: {
        adminId: args.adminId,
        scopes: args.scopes,
        queryPreview: args.queryPreview.slice(0, 200),
        cached: args.cached,
      },
      severity: "info",
      correlationId: args.correlationId ?? `console-${args.adminId.slice(0, 8)}-${Date.now().toString(36)}`,
    });
  } catch (err) {
    console.warn(`[coordinator/console] emit query fallback:`, (err as Error).message);
  }
}

export async function emitConsoleOverride(args: {
  adminId: string;
  target: string;
  rationale: string;
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "admin_override",
      payload: { adminId: args.adminId, target: args.target, rationale: args.rationale.slice(0, 400) },
      severity: "warn",
      correlationId: args.correlationId,
    });
  } catch (err) {
    console.warn(`[coordinator/console] emit override fallback:`, (err as Error).message);
  }
}

export async function emitConsolePin(args: {
  adminId: string;
  pinId: string;
  contentPreview: string;
  correlationId?: string;
}): Promise<void> {
  try {
    const c = getCoordinator();
    await c.emit({
      aiName: AI_NAME,
      eventType: "pin_created",
      payload: { adminId: args.adminId, pinId: args.pinId, contentPreview: args.contentPreview.slice(0, 200) },
      severity: "info",
      correlationId: args.correlationId,
    });
  } catch (err) {
    console.warn(`[coordinator/console] emit pin fallback:`, (err as Error).message);
  }
}

export function wireConsoleToCoordinator(): void {
  // Task #9 — "console" non ha un loop schedulato (le emit sopra sono
  // sincrone alla richiesta admin, non ripetibili a piacere): gatarle con
  // canRunJob aggiungerebbe latenza/IO a una richiesta interattiva senza un
  // vero beneficio di coordinamento. Ci limitiamo a registrare il subsystem
  // nel registry del coordinator per visibilità/audit nell'admin panel, senza
  // alcun controllo bloccante sulle emit.
  registerGatedJob("console-adapter", { critical: false });
  console.log("[INIT] AI Coordinator wire console");
}
