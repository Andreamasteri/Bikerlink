import bcrypt from "bcryptjs";
import { db } from "../db";
import { storage } from "../storage";
import {
  users, userProfiles, userMotorcycles, zavorrinaWishlists, zavorrinaWishlistMotos,
  conversations, conversationParticipants, messages,
} from "@shared/db";
import { eq, sql, inArray } from "drizzle-orm";
import {
  EUROPEAN_ZONES, MOTORCYCLES,
  randOffset, pickRandom, pickRandomN, getMotoYear, getBio, getWelcomeMessage,
  distributeUniformly,
} from "../mass-seed-data";

export const SEED_TAG = "mass_seed_5k_v1";
export const OLD_SEED_TAGS = ["mass_seed_eu_v1", "mass_seed_2420"];

export interface UserSpec {
  userType: "biker" | "zavorrina" | "coppia";
  sex: "M" | "F";
  coupleSexConfig: string | null;
  region: string;
  country: string;
  lat: number;
  lng: number;
  spokenLanguages: string[];
  specKey: string;
}

export interface UserRow {
  nickname: string;
  email: string;
  password: string;
  userType: string;
  sex: string;
  coupleSexConfig: string | null;
  role: string;
  status: string;
  isFake: boolean;
  region: string;
  birthYear: number;
  emailVerified: boolean;
  eulaAccepted: boolean;
  country: string;
  spokenLanguages: string[];
  lastLoginAt: Date;
  invitationCode: string;
  firstLoginLat: number;
  firstLoginLng: number;
}

export interface ProfileRow {
  userId: string;
  isAvailable: boolean;
  latitude: number;
  longitude: number;
  maxPickupDistance: number;
  bio: string;
}

export interface MotoRow {
  userId: string;
  brand: string;
  model: string;
  year: number;
  displacement: number;
  motorcycleType: string;
  ridingStyle: string;
}

export interface WishlistMotoRow {
  wishlistId: string;
  brand: string;
  model: string;
  motorcycleType: string;
  ridingStyle: string;
}

export interface SpecMeta {
  nickname: string;
  email: string;
  spec: UserSpec;
  lat: number;
  lng: number;
}

export function buildSpecs(): UserSpec[] {
  const specs: UserSpec[] = [];
  const categories: { userType: "biker" | "zavorrina" | "coppia"; sex: "M" | "F"; coupleSexConfig: string | null; count: number }[] = [
    { userType: "biker", sex: "M", coupleSexConfig: null, count: 3000 },
    { userType: "biker", sex: "F", coupleSexConfig: null, count: 500 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+F", count: 300 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+M", count: 150 },
    { userType: "coppia", sex: "F", coupleSexConfig: "F+F", count: 50 },
    { userType: "zavorrina", sex: "F", coupleSexConfig: null, count: 850 },
    { userType: "zavorrina", sex: "M", coupleSexConfig: null, count: 150 },
  ];

  const zoneCount = EUROPEAN_ZONES.length;

  for (const cat of categories) {
    const distribution = distributeUniformly(cat.count, zoneCount);
    let catIndex = 0;
    for (let r = 0; r < zoneCount; r++) {
      const zone = EUROPEAN_ZONES[r];
      for (let i = 0; i < distribution[r]; i++) {
        const csc = cat.coupleSexConfig ?? "none";
        specs.push({
          userType: cat.userType,
          sex: cat.sex,
          coupleSexConfig: cat.coupleSexConfig,
          region: zone.region,
          country: zone.country,
          lat: zone.lat,
          lng: zone.lng,
          spokenLanguages: zone.spokenLanguages,
          specKey: `${cat.userType}_${cat.sex}_${csc}_${zone.region}_${catIndex}`
        });
        catIndex++;
      }
    }
  }

  return specs;
}

export async function ensureOfficialAccount(): Promise<string> {
  const existing = await storage.getUserByNickname("BikerLink_Official");
  if (existing) {
    if (!existing.isFake) {
      await storage.updateUser(existing.id, { isFake: true });
    }
    return existing.id;
  }

  const noLoginPw = await bcrypt.hash(`__system_nologin__${Date.now()}__${Math.random()}`, 12);
  const user = await storage.createUser({
    nickname: "BikerLink_Official",
    email: "noreply-system@bikerlink.internal",
    password: noLoginPw,
    userType: "biker",
    sex: "M",
    role: "user",
    status: "active",
    isFake: true,
    region: "Lombardia",
    birthYear: 2000,
    emailVerified: false,
    eulaAccepted: false
  });
  return user.id;
}

export async function cleanupOldSeedUsers(logError: (context: string, err: unknown) => void): Promise<void> {
  const allOldUsers: { id: string }[] = [];
  for (const tag of OLD_SEED_TAGS) {
    const tagged = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.invitationCode, tag));
    allOldUsers.push(...tagged);
  }
  const oldTaggedUsers = allOldUsers;

  if (oldTaggedUsers.length === 0) return;

  console.log(`[mass-seed] Cleaning up ${oldTaggedUsers.length} old seed users (tags: ${OLD_SEED_TAGS.join(", ")})...`);

  const CLEANUP_BATCH = 100;
  for (let i = 0; i < oldTaggedUsers.length; i += CLEANUP_BATCH) {
    const batch = oldTaggedUsers.slice(i, i + CLEANUP_BATCH);
    const ids = batch.map(u => u.id);

    for (const uid of ids) {
      try {
        await db.delete(zavorrinaWishlistMotos)
          .where(sql`${zavorrinaWishlistMotos.wishlistId} IN (SELECT id FROM zavorrina_wishlists WHERE user_id = ${uid})`);
        await db.delete(zavorrinaWishlists).where(eq(zavorrinaWishlists.userId, uid));
        await db.delete(userMotorcycles).where(eq(userMotorcycles.userId, uid));

        const userConvs = await db.select({ convId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.userId, uid));
        for (const c of userConvs) {
          await db.delete(messages).where(eq(messages.conversationId, c.convId));
          await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, c.convId));
          await db.delete(conversations).where(eq(conversations.id, c.convId));
        }

        await db.delete(userProfiles).where(eq(userProfiles.userId, uid));
        await db.delete(users).where(eq(users.id, uid));
      } catch (err: unknown) {
        logError(`cleanup-old-user-${uid}`, err);
      }
    }

    if (i % (CLEANUP_BATCH * 5) === 0 && i > 0) {
      console.log(`[mass-seed] Cleanup progress: ${i}/${oldTaggedUsers.length}`);
    }
  }

  console.log(`[mass-seed] Cleanup complete: removed ${oldTaggedUsers.length} old seed users`);
}

export async function reconcileExistingUsers(officialId: string, logError: (context: string, err: unknown) => void): Promise<void> {
  const taggedUsers = await db.select({
    id: users.id, userType: users.userType, sex: users.sex, nickname: users.nickname
  })
    .from(users)
    .where(eq(users.invitationCode, SEED_TAG));

  if (taggedUsers.length === 0) return;
  console.log(`[mass-seed] Reconcile bulk start for ${taggedUsers.length} users...`);

  const taggedIds = taggedUsers.map(u => u.id);

  const [existingProfiles, existingMotoRows, existingWishlists, officialConvRows] = await Promise.all([
    db.select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, taggedIds)),
    db.select({ userId: userMotorcycles.userId })
      .from(userMotorcycles)
      .where(inArray(userMotorcycles.userId, taggedIds)),
    db.select({ userId: zavorrinaWishlists.userId })
      .from(zavorrinaWishlists)
      .where(inArray(zavorrinaWishlists.userId, taggedIds)),
    db.select({ convId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, officialId)),
  ]);

  const profileUserIds = new Set(existingProfiles.map(p => p.userId));
  const motoCountByUser = new Map<string, number>();
  for (const row of existingMotoRows) {
    motoCountByUser.set(row.userId, (motoCountByUser.get(row.userId) ?? 0) + 1);
  }
  const wishlistUserIds = new Set(existingWishlists.map(w => w.userId));
  const officialConvSet = new Set(officialConvRows.map(c => c.convId));

  const taggedUserConvRows = await db.select({
    convId: conversationParticipants.conversationId,
    userId: conversationParticipants.userId
  })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.userId, taggedIds));

  const usersWithOfficialConv = new Set<string>();
  for (const row of taggedUserConvRows) {
    if (officialConvSet.has(row.convId)) {
      usersWithOfficialConv.add(row.userId);
    }
  }

  const missingProfileRows: ProfileRow[] = [];
  const missingMotoRows: MotoRow[] = [];

  for (const u of taggedUsers) {
    if (!profileUserIds.has(u.id)) {
      const zone = pickRandom(EUROPEAN_ZONES);
      missingProfileRows.push({
        userId: u.id,
        isAvailable: Math.random() > 0.3,
        latitude: zone.lat + randOffset(),
        longitude: zone.lng + randOffset(),
        maxPickupDistance: 20 + Math.floor(Math.random() * 80),
        bio: getBio(u.userType, u.sex)
      });
    }
    if (u.userType === "biker" || u.userType === "coppia") {
      const count = motoCountByUser.get(u.id) ?? 0;
      if (count < 2) {
        const motos = pickRandomN(MOTORCYCLES, 2 - count);
        for (const moto of motos) {
          missingMotoRows.push({
            userId: u.id,
            brand: moto.brand,
            model: moto.model,
            year: getMotoYear(),
            displacement: moto.displacement,
            motorcycleType: moto.type,
            ridingStyle: moto.style
          });
        }
      }
    }
  }

  if (missingProfileRows.length > 0) {
    try {
      await db.insert(userProfiles).values(missingProfileRows).onConflictDoNothing();
    } catch (err: unknown) {
      logError("reconcile-bulk-profiles", err);
    }
  }

  if (missingMotoRows.length > 0) {
    try {
      await db.insert(userMotorcycles).values(missingMotoRows);
    } catch (err: unknown) {
      logError("reconcile-bulk-motos", err);
    }
  }

  const zavarrine = taggedUsers.filter(u => u.userType === "zavorrina" && !wishlistUserIds.has(u.id));
  for (const u of zavarrine) {
    try {
      const wishlist = await storage.createOrUpdateWishlist(u.id, "Cerco un biker per bei giri in moto");
      const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
      const wishlistMotoValues: WishlistMotoRow[] = desiredMotos.map(m => ({
        wishlistId: wishlist.id,
        brand: m.brand,
        model: m.model,
        motorcycleType: m.type,
        ridingStyle: m.style
      }));
      await db.insert(zavorrinaWishlistMotos).values(wishlistMotoValues);
    } catch (err: unknown) {
      logError(`reconcile-wishlist-${u.id}`, err);
    }
  }

  const usersNeedingConv = taggedUsers.filter(u => !usersWithOfficialConv.has(u.id));
  const CONV_BATCH = 100;
  for (let i = 0; i < usersNeedingConv.length; i += CONV_BATCH) {
    const batch = usersNeedingConv.slice(i, i + CONV_BATCH);
    try {
      const convRows = batch.map(() => ({ conversationType: "private" as const }));
      const createdConvs = await db.insert(conversations).values(convRows).returning();
      const participantRows: { conversationId: string; userId: string }[] = [];
      const messageRows: { conversationId: string; senderId: string; content: string; messageType: string }[] = [];
      for (let j = 0; j < createdConvs.length; j++) {
        const conv = createdConvs[j];
        const u = batch[j];
        participantRows.push(
          { conversationId: conv.id, userId: officialId },
          { conversationId: conv.id, userId: u.id },
        );
        messageRows.push({
          conversationId: conv.id,
          senderId: officialId,
          content: getWelcomeMessage(u.userType, u.sex),
          messageType: "text"
        });
      }
      if (participantRows.length > 0) {
        await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
      }
      if (messageRows.length > 0) {
        await db.insert(messages).values(messageRows);
      }
    } catch (err: unknown) {
      logError(`reconcile-conv-batch-${i}`, err);
    }
    await new Promise(r => setTimeout(r, 5));
  }

  console.log(`[mass-seed] Reconcile complete: ${taggedUsers.length} users checked, ${missingProfileRows.length} profiles added, ${usersNeedingConv.length} convs added`);
}
