// Task #2637 — Memoria contestuale della AI Console.
// Estrae entità citate (reportId, userId, snapshotId, violationId, route) dai
// messaggi e aggiorna summary incrementale + lista entità sulla conversazione.
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { aiConversations, type AiConversation } from "@shared/db";

export interface ConversationMemory {
  summary: string;
  entities: ConversationEntities;
}

export interface ConversationEntities {
  reportId: string[];
  userId: string[];
  snapshotId: string[];
  violationId: string[];
  route: string[];
}

const EMPTY: ConversationEntities = {
  reportId: [], userId: [], snapshotId: [], violationId: [], route: [],
};

// UUID v4-ish o stringhe 12-36 hex/alnum (id varchar(36) usati nello schema).
const UUID_RE = /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi;
const ROUTE_RE = /\/api\/[a-zA-Z0-9_\-/:]+/g;

const SCOPED_RE: Array<{ kind: keyof ConversationEntities; re: RegExp }> = [
  { kind: "reportId", re: /\breport[_\s-]?id[:=\s]+([a-f0-9-]{8,36})/gi },
  { kind: "userId", re: /\buser[_\s-]?id[:=\s]+([a-f0-9-]{8,36})/gi },
  { kind: "snapshotId", re: /\bsnapshot[_\s-]?id[:=\s]+([a-f0-9-]{8,36})/gi },
  { kind: "violationId", re: /\bviolation[_\s-]?id[:=\s]+([a-f0-9-]{8,36})/gi },
];

/** Estrae entità da un testo libero (messaggio admin o risposta assistente). */
export function extractEntities(text: string): ConversationEntities {
  const out: ConversationEntities = { reportId: [], userId: [], snapshotId: [], violationId: [], route: [] };
  for (const { kind, re } of SCOPED_RE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out[kind].push(m[1]);
  }
  const uuids = text.match(UUID_RE) ?? [];
  for (const u of uuids) {
    // Heurística: se il contesto non ha ancorato l'UUID a uno scope, lo
    // mettiamo in un buffer generico "userId" è troppo aggressivo → skippiamo.
    if (!out.reportId.includes(u) && !out.userId.includes(u)
      && !out.snapshotId.includes(u) && !out.violationId.includes(u)) {
      // unknown UUID — useful per query future, archiviato come "userId" only if già citato altrove
    }
  }
  const routes = text.match(ROUTE_RE) ?? [];
  out.route.push(...routes);
  // dedup
  for (const k of Object.keys(out) as (keyof ConversationEntities)[]) {
    out[k] = Array.from(new Set(out[k])).slice(0, 50);
  }
  return out;
}

/** Merge incrementale di entità accumulate sulla conversazione. */
export function mergeEntities(prev: ConversationEntities | null | undefined, next: ConversationEntities): ConversationEntities {
  const base = prev ?? EMPTY;
  const merged: ConversationEntities = { ...EMPTY };
  for (const k of Object.keys(merged) as (keyof ConversationEntities)[]) {
    merged[k] = Array.from(new Set([...(base[k] ?? []), ...next[k]])).slice(0, 100);
  }
  return merged;
}

/** Carica memoria conversazione (summary + entità). Null se non esiste. */
export async function loadMemory(conversationId: string): Promise<ConversationMemory | null> {
  const [row] = await db.select().from(aiConversations)
    .where(eq(aiConversations.id, conversationId)).limit(1);
  if (!row) return null;
  return {
    summary: row.summary ?? "",
    entities: (row.entities as ConversationEntities | null) ?? EMPTY,
  };
}

/** Aggiorna memoria conversazione dopo un turno (user+assistant). */
export async function updateMemory(
  conversationId: string,
  userMessage: string,
  assistantText: string,
  scopesUsed: string[],
): Promise<ConversationMemory> {
  const current = await loadMemory(conversationId);
  const newEntities = mergeEntities(
    current?.entities,
    mergeEntities(extractEntities(userMessage), extractEntities(assistantText)),
  );
  // Summary incrementale: append ultimo turno troncato + scope usati.
  const turn = `[${new Date().toISOString().slice(0, 16)}] (${scopesUsed.join(",")}) ${userMessage.slice(0, 200)}`;
  const summary = [(current?.summary ?? ""), turn].filter(Boolean).join("\n").split("\n").slice(-12).join("\n");
  await db.update(aiConversations).set({
    summary, entities: newEntities, updatedAt: new Date(), lastMessageAt: new Date(),
  }).where(eq(aiConversations.id, conversationId));
  return { summary, entities: newEntities };
}

/** Costruisce un blocco system context da iniettare al system prompt dell'agente. */
export function buildSystemContext(mem: ConversationMemory | null): string {
  if (!mem) return "";
  const lines: string[] = [];
  if (mem.summary) lines.push(`STORIA RECENTE:\n${mem.summary}`);
  const ent = mem.entities;
  const refs: string[] = [];
  if (ent.reportId.length) refs.push(`reportId: ${ent.reportId.slice(0, 10).join(", ")}`);
  if (ent.userId.length) refs.push(`userId: ${ent.userId.slice(0, 10).join(", ")}`);
  if (ent.snapshotId.length) refs.push(`snapshotId: ${ent.snapshotId.slice(0, 10).join(", ")}`);
  if (ent.violationId.length) refs.push(`violationId: ${ent.violationId.slice(0, 10).join(", ")}`);
  if (ent.route.length) refs.push(`route: ${ent.route.slice(0, 10).join(", ")}`);
  if (refs.length) lines.push(`ENTITÀ GIÀ CITATE:\n- ${refs.join("\n- ")}`);
  return lines.join("\n\n");
}

export type { AiConversation };
