import { eq, and, or, sql, desc, asc, inArray } from "drizzle-orm";
import { db } from "../db";
import { systemAccountConditions } from "../lib/system-account-filter";
import {
  users, userPhotos, userMotorcycles, userProfiles, motorcyclePhotos,
  type User, type InsertUser,
  type UserPhoto, type InsertUserPhoto,
  type UserMotorcycle, type InsertUserMotorcycle,
  type UserProfile, type InsertUserProfile,
  type MotorcyclePhoto, type InsertMotorcyclePhoto,
} from "@shared/schema";

function maskHiddenLocation(profile: UserProfile | null | undefined): UserProfile {
  if (!profile) return profile as unknown as UserProfile;
  if (profile.hideFromMap) {
    return { ...profile, latitude: null, longitude: null };
  }
  return profile;
}

function maskHiddenLocationRows<T extends { profile: UserProfile | null }>(rows: T[]): T[] {
  return rows.map((r) => {
    if (!r.profile || !r.profile.hideFromMap) return r;
    return { ...r, profile: { ...r.profile, latitude: null, longitude: null }, distance: 0 };
  });
}

export { maskHiddenLocation, maskHiddenLocationRows };

export class UsersStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, ids));
  }

  async getUserByNickname(nickname: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`LOWER(${users.nickname}) = LOWER(${nickname})`).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`LOWER(${users.email}) = LOWER(${email})`).limit(1);
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async requestUserDeletion(userId: string): Promise<void> {
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await db.update(users).set({ deletionRequestedAt: now, deletionScheduledFor: scheduledFor }).where(eq(users.id, userId));
  }

  async cancelUserDeletion(userId: string): Promise<void> {
    await db.update(users).set({ deletionRequestedAt: null, deletionScheduledFor: null }).where(eq(users.id, userId));
  }

  async markUserEmailVerified(userId: string): Promise<void> {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }

  async getUserPhotos(userId: string): Promise<UserPhoto[]> {
    return db.select().from(userPhotos).where(eq(userPhotos.userId, userId)).orderBy(asc(userPhotos.sortOrder));
  }

  async createUserPhoto(data: InsertUserPhoto): Promise<UserPhoto> {
    const [photo] = await db.insert(userPhotos).values(data).returning();
    return photo;
  }

  async deleteUserPhoto(id: string): Promise<void> {
    await db.delete(userPhotos).where(eq(userPhotos.id, id));
  }

  async getUserPhotoCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userPhotos).where(eq(userPhotos.userId, userId));
    return result[0]?.count ?? 0;
  }

  async getUserPhoto(id: string): Promise<UserPhoto | undefined> {
    const [photo] = await db.select().from(userPhotos).where(eq(userPhotos.id, id)).limit(1);
    return photo;
  }

  async getUnapprovedUserPhotos(): Promise<UserPhoto[]> {
    return db.select().from(userPhotos).where(eq(userPhotos.isApproved, false)).orderBy(asc(userPhotos.createdAt));
  }

  async updateUserPhotoApproval(id: string, approved: boolean): Promise<UserPhoto | undefined> {
    const [photo] = await db.update(userPhotos).set({ isApproved: approved }).where(eq(userPhotos.id, id)).returning();
    return photo;
  }

  async getUserMotorcycles(userId: string): Promise<UserMotorcycle[]> {
    return db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId));
  }

  async createUserMotorcycle(data: InsertUserMotorcycle): Promise<UserMotorcycle> {
    const [moto] = await db.insert(userMotorcycles).values(data).returning();
    return moto;
  }

  async updateUserMotorcycle(id: string, data: Partial<InsertUserMotorcycle>): Promise<UserMotorcycle | undefined> {
    const [moto] = await db.update(userMotorcycles).set(data).where(eq(userMotorcycles.id, id)).returning();
    return moto;
  }

  async deleteUserMotorcycle(id: string): Promise<void> {
    await db.delete(userMotorcycles).where(eq(userMotorcycles.id, id));
  }

  async getUserMotorcycle(id: string): Promise<UserMotorcycle | undefined> {
    const [moto] = await db.select().from(userMotorcycles).where(eq(userMotorcycles.id, id)).limit(1);
    return moto;
  }

  async searchUsers(query: string): Promise<{ user: User; profile: UserProfile | null }[]> {
    const pattern = `${query}%`;
    const results = await db
      .select({ user: users, profile: userProfiles })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(and(eq(users.status, "active"), eq(users.ghostMode, false), sql`${users.nickname} ILIKE ${pattern}`, ...systemAccountConditions(users)))
      .limit(20);
    return results.map(r => ({ user: r.user, profile: maskHiddenLocation(r.profile) }));
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return profile;
  }

  async getUserProfilesByIds(ids: string[]): Promise<UserProfile[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
    return rows.map((p) => maskHiddenLocation(p));
  }

  async createUserProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values(data).returning();
    return profile;
  }

  async updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db.update(userProfiles).set({ ...data, updatedAt: new Date() }).where(eq(userProfiles.userId, userId)).returning();
    return profile;
  }

  async upsertUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile> {
    const [profile] = await db
      .insert(userProfiles)
      .values({ userId, ...data })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { ...data, updatedAt: new Date() } })
      .returning();
    return profile;
  }

  async getMotorcyclePhotos(motorcycleId: string): Promise<MotorcyclePhoto[]> {
    return db.select().from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId)).orderBy(asc(motorcyclePhotos.sortOrder));
  }

  async getMotorcyclePhoto(id: string): Promise<MotorcyclePhoto | undefined> {
    const [photo] = await db.select().from(motorcyclePhotos).where(eq(motorcyclePhotos.id, id)).limit(1);
    return photo;
  }

  async addMotorcyclePhoto(data: InsertMotorcyclePhoto): Promise<MotorcyclePhoto> {
    const [photo] = await db.insert(motorcyclePhotos).values(data).returning();
    return photo;
  }

  async deleteMotorcyclePhoto(id: string): Promise<void> {
    await db.delete(motorcyclePhotos).where(eq(motorcyclePhotos.id, id));
  }

  async getMotorcyclePhotoCount(motorcycleId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(motorcyclePhotos).where(eq(motorcyclePhotos.motorcycleId, motorcycleId));
    return Number(result[0]?.count ?? 0);
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }

  async recordFakeUserInteraction(fakeUserId: string, realUserId: string, interactionType: string): Promise<void> {
    const { fakeUserInteractions } = await import("@shared/schema");
    await db.insert(fakeUserInteractions).values({ fakeUserId, realUserId, interactionType });
  }

  async findMatchingBikerMotos(brand: string, model: string, ridingStyle: string, motorcycleType: string): Promise<UserMotorcycle[]> {
    if (brand && model) {
      return db.select().from(userMotorcycles).where(and(
        sql`LOWER(${userMotorcycles.brand}) = LOWER(${brand})`,
        sql`(LOWER(${userMotorcycles.model}) LIKE '%' || LOWER(${model}) || '%' OR LOWER(${model}) LIKE '%' || LOWER(${userMotorcycles.model}) || '%')`,
        sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`,
      ));
    }
    if (motorcycleType) {
      return db.select().from(userMotorcycles).where(and(
        sql`LOWER(${userMotorcycles.motorcycleType}) = LOWER(${motorcycleType})`,
        sql`LOWER(${userMotorcycles.ridingStyle}) = LOWER(${ridingStyle})`,
      ));
    }
    return [];
  }
}
