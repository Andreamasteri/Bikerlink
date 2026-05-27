import DataLoader from "dataloader";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "@shared/db";

export function createUserLoader(): DataLoader<string, User | null> {
  return new DataLoader<string, User | null>(async (ids) => {
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) return ids.map(() => null);
    const rows = await db.select().from(users).where(inArray(users.id, uniq as string[]));
    const map = new Map<string, User>();
    for (const r of rows) map.set(r.id, r);
    return ids.map((id) => map.get(id) ?? null);
  }, {
    cache: true,
    maxBatchSize: 200,
  });
}

export type UserLoader = ReturnType<typeof createUserLoader>;
