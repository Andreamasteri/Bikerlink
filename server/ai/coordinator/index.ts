// Task #2649 — `AiCoordinator`: event bus unificato + memoria DB delle AI.
// Greenfield: nessun sottosistema esistente è collegato (scope task #2615).
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { getRedis, createPubSubClient } from "../../cache/redis";
import type Redis from "ioredis";
import {
  aiConflicts,
  aiDecisions,
  aiEvents,
} from "@shared/db";
import {
  AiDecisionInputSchema,
  AiEventInputSchema,
  type AiDecisionInput,
  type AiEventInput,
  type ConflictResolution,
  type CoordinatorSubscription,
  type Severity,
} from "./types";
import { evaluateConflict as policyEvaluateConflict, evaluateEvent as policyEvaluateEvent } from "./policy-engine";
import { isAiPaused } from "./index.part2";

type EventCallback = (evt: AiEventBroadcast) => void | Promise<void>;

export interface AiEventBroadcast {
  id: string;
  aiName: string;
  eventType: string;
  payload: Record<string, unknown>;
  severity: Severity;
  correlationId: string | null;
  createdAt: string;
}

const CHANNEL_PREFIX = "ai:events:";
const ADMIN_BROADCAST = "ai:admin:broadcast";

/**
 * Singleton — un solo bus per processo. `emit`/`recordDecision` scrivono su DB
 * e (se disponibile) pubblicano su Redis. `subscribe` apre una connessione
 * Redis dedicata (subscribe lock) e instrada gli eventi al callback.
 *
 * Fallback senza Redis: emit funziona comunque (solo DB). subscribe registra
 * un callback in-process: gli emit dello stesso processo notificano i listener
 * locali, gli emit di altri processi NON vengono propagati (Redis è l'unica
 * via cross-process).
 */
export class AiCoordinator {
  private localListeners: Map<string, Set<EventCallback>> = new Map();
  private subscribers: Array<{
    client: Redis | null;
    pattern: string;
    cb: EventCallback;
  }> = [];

  async emit(input: AiEventInput): Promise<{ id: string; policy: ReturnType<typeof policyEvaluateEvent> }> {
    const parsed = AiEventInputSchema.parse(input);
    // Task #2657 — coordinator-disabled resilience: caller non blocca mai.
    if (process.env.COORDINATOR_DISABLED === "1") {
      return { id: "", policy: { matched: false, ruleId: null, action: "ALLOW", message: "", rationale: "coordinator-disabled" } };
    }
    // Task #2657 — kill switch: emit ignorato se AI o layer in pausa.
    // Bypass per `admin`: governance/audit deve sempre essere registrato e
    // propagato via WS anche quando l'intero layer è in pausa.
    if (parsed.aiName !== "admin" && await isAiPaused(parsed.aiName)) {
      return { id: "", policy: { matched: false, ruleId: null, action: "ALLOW", message: "", rationale: "paused" } };
    }
    const [row] = await db.insert(aiEvents).values({
      aiName: parsed.aiName,
      eventType: parsed.eventType,
      payload: parsed.payload as Record<string, unknown>,
      severity: parsed.severity,
      correlationId: parsed.correlationId ?? null,
    }).returning({ id: aiEvents.id, createdAt: aiEvents.createdAt });

    const broadcast: AiEventBroadcast = {
      id: row.id,
      aiName: parsed.aiName,
      eventType: parsed.eventType,
      payload: parsed.payload as Record<string, unknown>,
      severity: parsed.severity,
      correlationId: parsed.correlationId ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };

    // Notifica listener in-process per chiunque sia interessato a `aiName` o "*".
    void this.fanoutLocal(broadcast);

    const redis = getRedis();
    if (redis) {
      try {
        const payload = JSON.stringify(broadcast);
        await redis.publish(CHANNEL_PREFIX + parsed.aiName, payload);
        if (parsed.severity === "critical") {
          await redis.publish(ADMIN_BROADCAST, payload);
        }
      } catch (err) {
        console.warn("[ai-coordinator/emit] redis publish failed:", (err as Error).message);
      }
    }

    const policy = policyEvaluateEvent(parsed);
    return { id: row.id, policy };
  }

  async subscribe(aiName: string | "*", cb: EventCallback): Promise<CoordinatorSubscription> {
    const key = aiName;

    // Tentativo Redis prima: se va a buon fine, NON registriamo il listener
    // locale (eviteremmo doppia consegna locale + Redis loopback). Solo se
    // Redis non è disponibile o psubscribe fallisce, ricadiamo sul fanout
    // in-process.
    let client: Redis | null = null;
    let usingRedis = false;
    if (process.env.REDIS_URL) {
      try {
        client = createPubSubClient();
        if (!client) throw new Error("createPubSubClient returned null");
        // Silenzio errori di connessione sul client pub/sub (ETIMEDOUT ecc.)
        // per evitare flooding "Unhandled error event" nei log.
        client.on("error", () => {});
        const pattern = aiName === "*" ? CHANNEL_PREFIX + "*" : CHANNEL_PREFIX + aiName;
        await client.psubscribe(pattern);
        client.on("pmessage", (_p: string, _channel: string, message: string) => {
          try {
            const evt = JSON.parse(message) as AiEventBroadcast;
            void cb(evt);
          } catch (err) {
            console.warn("[ai-coordinator/subscribe] parse failed:", (err as Error).message);
          }
        });
        this.subscribers.push({ client, pattern, cb });
        usingRedis = true;
      } catch (err) {
        // Redis pub/sub non disponibile da cloud (es. porta non forwardata dal router).
        // Fallback automatico al fanout in-process — nessun impatto funzionale.
        console.log("[ai-coordinator/subscribe] redis pub/sub non raggiungibile (fallback in-process):", (err as Error).message);
        // Chiude il client duplicato per evitare leak di socket.
        if (client) {
          try { client.disconnect(); } catch { /* ignore */ }
        }
        client = null;
      }
    }

    let set: Set<EventCallback> | undefined;
    if (!usingRedis) {
      set = this.localListeners.get(key);
      if (!set) {
        set = new Set();
        this.localListeners.set(key, set);
      }
      set.add(cb);
    }

    return {
      unsubscribe: async () => {
        if (set) {
          set.delete(cb);
          if (set.size === 0) this.localListeners.delete(key);
        }
        if (client) {
          try {
            await client.punsubscribe();
            await client.quit();
          } catch { /* ignore */ }
        }
        this.subscribers = this.subscribers.filter((s) => s.cb !== cb);
      },
    };
  }

  async query(filters: {
    aiName?: string;
    eventType?: string;
    severity?: Severity;
    correlationId?: string;
    sinceHours?: number;
    limit?: number;
    offset?: number;
  } = {}) {
    const conds: SQL[] = [];
    if (filters.aiName) conds.push(eq(aiEvents.aiName, filters.aiName));
    if (filters.eventType) conds.push(eq(aiEvents.eventType, filters.eventType));
    if (filters.severity) conds.push(eq(aiEvents.severity, filters.severity));
    if (filters.correlationId) conds.push(eq(aiEvents.correlationId, filters.correlationId));
    if (filters.sinceHours && filters.sinceHours > 0) {
      conds.push(gte(aiEvents.createdAt, new Date(Date.now() - filters.sinceHours * 3600_000)));
    }
    const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
    const offset = Math.max(0, filters.offset ?? 0);
    const where = conds.length ? and(...conds) : undefined;
    const rows = await db.select().from(aiEvents)
      .where(where)
      .orderBy(desc(aiEvents.createdAt))
      .limit(limit).offset(offset);
    return { rows, limit, offset };
  }

  async recordDecision(input: AiDecisionInput): Promise<string> {
    const parsed = AiDecisionInputSchema.parse(input);
    const [row] = await db.insert(aiDecisions).values({
      aiName: parsed.aiName,
      decisionType: parsed.decisionType,
      input: parsed.input as Record<string, unknown>,
      output: parsed.output as Record<string, unknown>,
      rationale: parsed.rationale ?? null,
      confidence: parsed.confidence !== undefined ? String(parsed.confidence) : null,
      tookMs: parsed.tookMs,
      correlationId: parsed.correlationId ?? null,
    }).returning({ id: aiDecisions.id });
    return row.id;
  }

  async evaluateConflict(opts: {
    eventIdA: string;
    eventIdB: string;
    conflictType: string;
  }): Promise<ConflictResolution> {
    const [a] = await db.select().from(aiEvents).where(eq(aiEvents.id, opts.eventIdA)).limit(1);
    const [b] = await db.select().from(aiEvents).where(eq(aiEvents.id, opts.eventIdB)).limit(1);
    if (!a || !b) throw new Error("Coordinator.evaluateConflict: eventi non trovati");

    const aInput: AiEventInput = {
      aiName: a.aiName,
      eventType: a.eventType,
      payload: (a.payload ?? {}) as Record<string, unknown>,
      severity: a.severity as Severity,
      correlationId: a.correlationId ?? undefined,
    };
    const bInput: AiEventInput = {
      aiName: b.aiName,
      eventType: b.eventType,
      payload: (b.payload ?? {}) as Record<string, unknown>,
      severity: b.severity as Severity,
      correlationId: b.correlationId ?? undefined,
    };

    const evalResult = policyEvaluateConflict(opts.conflictType, aInput, bInput);
    const resolvedBy = evalResult.matched ? "policy" : "none";
    const [row] = await db.insert(aiConflicts).values({
      eventIdA: opts.eventIdA,
      eventIdB: opts.eventIdB,
      conflictType: opts.conflictType,
      resolvedBy,
      policyRuleId: evalResult.ruleId,
      resolutionRationale: evalResult.rationale,
      resolvedAt: evalResult.matched ? new Date() : null,
    }).returning({ id: aiConflicts.id });

    // Task #2657 — push conflict to admin WS bridge per realtime UI (<2s).
    for (const fn of conflictListeners) {
      try {
        fn({
          conflictId: row.id,
          eventIdA: opts.eventIdA,
          eventIdB: opts.eventIdB,
          conflictType: opts.conflictType,
          resolvedBy,
          policyRuleId: evalResult.ruleId,
          createdAt: new Date().toISOString(),
        });
      } catch { /* noop */ }
    }

    return {
      conflictId: row.id,
      resolvedBy,
      policyRuleId: evalResult.ruleId,
      action: evalResult.action,
      rationale: evalResult.rationale,
    };
  }

  // ── Stats helpers consumati da Overview/Health ─────────────────────────
  async getOverview(sinceHours = 24): Promise<{
    perAi: Array<{
      aiName: string;
      events: number;
      decisions: number;
      criticals: number;
      conflictsOpen: number;
      lastActivityAt: string | null;
      lastEventType: string | null;
      healthScore: number;
    }>;
    totals: { events: number; decisions: number; criticals: number; conflictsOpen: number };
    sinceHours: number;
  }> {
    const since = new Date(Date.now() - sinceHours * 3600_000);
    const eventsRows = await db.select({
      aiName: aiEvents.aiName,
      total: sql<number>`count(*)::int`,
      criticals: sql<number>`count(*) filter (where ${aiEvents.severity} = 'critical')::int`,
      lastAt: sql<string | null>`max(${aiEvents.createdAt})`,
    }).from(aiEvents)
      .where(gte(aiEvents.createdAt, since))
      .groupBy(aiEvents.aiName);

    const decisionsRows = await db.select({
      aiName: aiDecisions.aiName,
      total: sql<number>`count(*)::int`,
      lastAt: sql<string | null>`max(${aiDecisions.createdAt})`,
    }).from(aiDecisions)
      .where(gte(aiDecisions.createdAt, since))
      .groupBy(aiDecisions.aiName);

    const conflictsRows = await db.select({
      total: sql<number>`count(*)::int`,
    }).from(aiConflicts).where(sql`${aiConflicts.resolvedAt} IS NULL`);

    // Last event TYPE per AI nella finestra (Postgres DISTINCT ON via raw SQL).
    const lastTypeRows = (await db.execute<{ ai_name: string; event_type: string }>(sql`
      SELECT DISTINCT ON (ai_name) ai_name, event_type
      FROM ai_events
      WHERE created_at >= ${since}
      ORDER BY ai_name, created_at DESC
    `)).rows as Array<{ ai_name: string; event_type: string }>;

    const names = new Set<string>([...eventsRows.map((r) => r.aiName), ...decisionsRows.map((r) => r.aiName)]);
    const perAi = Array.from(names).map((name) => {
      const ev = eventsRows.find((r) => r.aiName === name);
      const dc = decisionsRows.find((r) => r.aiName === name);
      const lt = lastTypeRows.find((r) => r.ai_name === name);
      const lastEv = ev?.lastAt ? new Date(ev.lastAt as unknown as string).getTime() : 0;
      const lastDc = dc?.lastAt ? new Date(dc.lastAt as unknown as string).getTime() : 0;
      const last = Math.max(lastEv, lastDc);
      const criticals = ev?.criticals ?? 0;
      // Health score 0-100: 100=ottimo, decresce con critici (-15) e silenzio (>1h −10).
      const ageH = last > 0 ? (Date.now() - last) / 3_600_000 : sinceHours;
      const silencePenalty = ageH > 1 ? Math.min(30, Math.round(ageH * 5)) : 0;
      const healthScore = Math.max(0, Math.min(100, 100 - criticals * 15 - silencePenalty));
      return {
        aiName: name,
        events: ev?.total ?? 0,
        decisions: dc?.total ?? 0,
        criticals,
        conflictsOpen: 0, // breakdown per-AI fuori scope #2649
        lastActivityAt: last > 0 ? new Date(last).toISOString() : null,
        lastEventType: lt?.event_type ?? null,
        healthScore,
      };
    }).sort((a, b) => b.events - a.events);

    return {
      perAi,
      totals: {
        events: eventsRows.reduce((s, r) => s + r.total, 0),
        decisions: decisionsRows.reduce((s, r) => s + r.total, 0),
        criticals: eventsRows.reduce((s, r) => s + r.criticals, 0),
        conflictsOpen: conflictsRows[0]?.total ?? 0,
      },
      sinceHours,
    };
  }

  async getHealth(sinceHours = 24) {
    const since = new Date(Date.now() - sinceHours * 3600_000);
    const eventsRows = await db.select({
      aiName: aiEvents.aiName,
      lastAt: sql<string | null>`max(${aiEvents.createdAt})`,
    }).from(aiEvents).where(gte(aiEvents.createdAt, since)).groupBy(aiEvents.aiName);

    const decisionsRows = await db.select({
      aiName: aiDecisions.aiName,
      total: sql<number>`count(*)::int`,
      avgMs: sql<number>`coalesce(avg(${aiDecisions.tookMs}), 0)::int`,
      lastAt: sql<string | null>`max(${aiDecisions.createdAt})`,
    }).from(aiDecisions).where(gte(aiDecisions.createdAt, since)).groupBy(aiDecisions.aiName);

    const conflictsAll = await db.select({
      total: sql<number>`count(*)::int`,
      resolvedPolicy: sql<number>`count(*) filter (where ${aiConflicts.resolvedBy} = 'policy')::int`,
      resolvedAdmin: sql<number>`count(*) filter (where ${aiConflicts.resolvedBy} = 'admin')::int`,
      open: sql<number>`count(*) filter (where ${aiConflicts.resolvedAt} IS NULL)::int`,
    }).from(aiConflicts).where(gte(aiConflicts.createdAt, since));

    const names = new Set<string>([...eventsRows.map((r) => r.aiName), ...decisionsRows.map((r) => r.aiName)]);
    const now = Date.now();
    const perAi = Array.from(names).map((name) => {
      const ev = eventsRows.find((r) => r.aiName === name);
      const dc = decisionsRows.find((r) => r.aiName === name);
      const lastEvMs = ev?.lastAt ? new Date(ev.lastAt as unknown as string).getTime() : 0;
      const lastDcMs = dc?.lastAt ? new Date(dc.lastAt as unknown as string).getTime() : 0;
      const lastHeartbeat = Math.max(lastEvMs, lastDcMs);
      return {
        aiName: name,
        lastHeartbeatAt: lastHeartbeat > 0 ? new Date(lastHeartbeat).toISOString() : null,
        secondsSinceHeartbeat: lastHeartbeat > 0 ? Math.floor((now - lastHeartbeat) / 1000) : null,
        avgDecisionMs: dc?.avgMs ?? 0,
        decisions: dc?.total ?? 0,
      };
    });

    const c = conflictsAll[0] ?? { total: 0, resolvedPolicy: 0, resolvedAdmin: 0, open: 0 };
    const decisionsTotal = decisionsRows.reduce((s, r) => s + r.total, 0);
    return {
      perAi,
      conflicts: c,
      ratios: {
        conflictsPerDecisionPct: decisionsTotal > 0
          ? Math.round((c.total / decisionsTotal) * 10000) / 100
          : 0,
        adminOverridePct: c.total > 0
          ? Math.round((c.resolvedAdmin / c.total) * 10000) / 100
          : 0,
      },
      sinceHours,
    };
  }

  private async fanoutLocal(evt: AiEventBroadcast): Promise<void> {
    const targets: EventCallback[] = [];
    const exact = this.localListeners.get(evt.aiName);
    if (exact) for (const cb of exact) targets.push(cb);
    const all = this.localListeners.get("*");
    if (all) for (const cb of all) targets.push(cb);
    for (const cb of targets) {
      try {
        await cb(evt);
      } catch (err) {
        console.warn("[ai-coordinator/fanout] listener error:", (err as Error).message);
      }
    }
  }
}

let singleton: AiCoordinator | null = null;
export function getCoordinator(): AiCoordinator {
  if (!singleton) singleton = new AiCoordinator();
  return singleton;
}

// Task #2657 — Conflict listener bus per realtime UI (admin WS bridge).
export interface ConflictBroadcast {
  conflictId: string;
  eventIdA: string;
  eventIdB: string;
  conflictType: string;
  resolvedBy: string;
  policyRuleId: string | null;
  createdAt: string;
}
type ConflictCallback = (c: ConflictBroadcast) => void;
const conflictListeners: Set<ConflictCallback> = new Set();
export function onConflictCreated(cb: ConflictCallback): () => void {
  conflictListeners.add(cb);
  return () => conflictListeners.delete(cb);
}

// Task #2657 — Pause / kill switch helpers. Stato in Redis con TTL; se Redis
// non disponibile fallback in-memory (process-local). Tutte le funzioni
// graceful: errori non propagano.
export * from "./index.part2";
