import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import {
  sosRequests,
  type SosRequest, type InsertSosRequest,
} from "@shared/db";
import { RouteAffinityMatchesStorage } from "./route-affinity-matches";

export class SosStorage extends RouteAffinityMatchesStorage {
  async createSosRequest(data: InsertSosRequest): Promise<SosRequest> {
    const [req] = await db.insert(sosRequests).values(data).returning();
    return req;
  }

  async getSosRequest(id: string): Promise<SosRequest | undefined> {
    const [req] = await db.select().from(sosRequests).where(eq(sosRequests.id, id)).limit(1);
    return req;
  }

  async getActiveSosRequestByUser(userId: string): Promise<SosRequest | undefined> {
    const [req] = await db.select().from(sosRequests)
      .where(and(eq(sosRequests.requesterId, userId), eq(sosRequests.status, "active")))
      .limit(1);
    return req;
  }

  async getActiveSosRequests(): Promise<SosRequest[]> {
    return db.select().from(sosRequests).where(eq(sosRequests.status, "active")).orderBy(desc(sosRequests.createdAt));
  }

  async updateSosRequest(id: string, data: Partial<InsertSosRequest>): Promise<SosRequest | undefined> {
    const [req] = await db.update(sosRequests).set({ ...data, updatedAt: new Date() }).where(eq(sosRequests.id, id)).returning();
    return req;
  }
}
