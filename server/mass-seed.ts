import bcrypt from "bcryptjs";
import { db } from "./db";
import { storage } from "./storage";
import {
  users, userProfiles, userMotorcycles, zavarrinaWishlists, zavarrinaWishlistMotos,
  conversations, conversationParticipants, messages,
  type User,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  REGIONS, REGION_COORDS, MOTORCYCLES,
  randOffset, randBirthYear, pickRandom, pickRandomN, getMotoYear, getBio, getWelcomeMessage,
  distributeUniformly, generateUniqueNickname, generateUniqueEmail,
} from "./mass-seed-data";

const SEED_TAG = "mass_seed_2420";

interface MassSeedStatus {
  running: boolean;
  created: number;
  total: number;
  error: string | null;
}

let massSeedStatus: MassSeedStatus = { running: false, created: 0, total: 0, error: null };

export function getMassSeedStatus(): MassSeedStatus {
  return { ...massSeedStatus };
}

const BATCH_SIZE = 50;

interface UserSpec {
  userType: "biker" | "zavorrina" | "coppia";
  sex: "M" | "F";
  coupleSexConfig: string | null;
  region: string;
  specKey: string;
}

interface UserRow {
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
}

interface ProfileRow {
  userId: string;
  isAvailable: boolean;
  latitude: number;
  longitude: number;
  maxPickupDistance: number;
  bio: string;
}

interface MotoRow {
  userId: string;
  brand: string;
  model: string;
  year: number;
  displacement: number;
  motorcycleType: string;
  ridingStyle: string;
}

interface WishlistMotoRow {
  wishlistId: string;
  brand: string;
  model: string;
  motorcycleType: string;
  ridingStyle: string;
}

interface SpecMeta {
  nickname: string;
  email: string;
  spec: UserSpec;
}

const seedErrors: string[] = [];

function logSeedError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const entry = `[${context}] ${msg}`;
  seedErrors.push(entry);
  console.error(`[mass-seed] ${entry}`);
}

function buildSpecs(): UserSpec[] {
  const specs: UserSpec[] = [];
  const categories: { userType: "biker" | "zavorrina" | "coppia"; sex: "M" | "F"; coupleSexConfig: string | null; count: number }[] = [
    { userType: "biker", sex: "M", coupleSexConfig: null, count: 1500 },
    { userType: "biker", sex: "F", coupleSexConfig: null, count: 200 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+F", count: 100 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+M", count: 50 },
    { userType: "coppia", sex: "F", coupleSexConfig: "F+F", count: 20 },
    { userType: "zavorrina", sex: "F", coupleSexConfig: null, count: 500 },
    { userType: "zavorrina", sex: "M", coupleSexConfig: null, count: 50 },
  ];

  for (const cat of categories) {
    const distribution = distributeUniformly(cat.count, REGIONS.length);
    let catIndex = 0;
    for (let r = 0; r < REGIONS.length; r++) {
      for (let i = 0; i < distribution[r]; i++) {
        const csc = cat.coupleSexConfig ?? "none";
        specs.push({
          userType: cat.userType,
          sex: cat.sex,
          coupleSexConfig: cat.coupleSexConfig,
          region: REGIONS[r],
          specKey: `${cat.userType}_${cat.sex}_${csc}_${REGIONS[r]}_${catIndex}`,
        });
        catIndex++;
      }
    }
  }

  return specs;
}

async function ensureOfficialAccount(): Promise<string> {
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
    eulaAccepted: false,
  });
  return user.id;
}

async function reconcileExistingUsers(officialId: string): Promise<void> {
  const taggedUsers = await db.select({
    id: users.id, userType: users.userType, sex: users.sex, nickname: users.nickname,
  })
    .from(users)
    .where(eq(users.invitationCode, SEED_TAG));

  for (const u of taggedUsers) {
    const [profileExists] = await db.select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.userId, u.id))
      .limit(1);

    if (!profileExists) {
      try {
        const region = pickRandom(REGIONS);
        const coords = REGION_COORDS[region];
        await db.insert(userProfiles).values({
          userId: u.id,
          isAvailable: Math.random() > 0.3,
          latitude: coords.lat + randOffset(),
          longitude: coords.lng + randOffset(),
          maxPickupDistance: 20 + Math.floor(Math.random() * 80),
          bio: getBio(u.userType, u.sex),
        }).onConflictDoNothing();
      } catch (err: unknown) {
        logSeedError(`reconcile-profile-${u.id}`, err);
      }
    }

    if (u.userType === "biker" || u.userType === "coppia") {
      const existingMotos = await db.select({ id: userMotorcycles.id })
        .from(userMotorcycles)
        .where(eq(userMotorcycles.userId, u.id));
      if (existingMotos.length < 2) {
        const needed = 2 - existingMotos.length;
        const motos = pickRandomN(MOTORCYCLES, needed);
        for (const moto of motos) {
          try {
            await db.insert(userMotorcycles).values({
              userId: u.id,
              brand: moto.brand,
              model: moto.model,
              year: getMotoYear(),
              displacement: moto.displacement,
              motorcycleType: moto.type,
              ridingStyle: moto.style,
            });
          } catch (err: unknown) {
            logSeedError(`reconcile-moto-${u.id}`, err);
          }
        }
      }
    }

    if (u.userType === "zavorrina") {
      const existingWl = await storage.getWishlist(u.id);
      if (!existingWl) {
        try {
          const wishlist = await storage.createOrUpdateWishlist(u.id, "Cerco un biker per bei giri in moto");
          const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          const wishlistMotoValues: WishlistMotoRow[] = desiredMotos.map(m => ({
            wishlistId: wishlist.id,
            brand: m.brand,
            model: m.model,
            motorcycleType: m.type,
            ridingStyle: m.style,
          }));
          await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
        } catch (err: unknown) {
          logSeedError(`reconcile-wishlist-${u.id}`, err);
        }
      }
    }

    const [hasConv] = await db.select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, u.id))
      .limit(1);

    if (!hasConv) {
      try {
        const [conv] = await db.insert(conversations).values({ conversationType: "private" }).returning();
        await db.insert(conversationParticipants).values([
          { conversationId: conv.id, userId: officialId },
          { conversationId: conv.id, userId: u.id },
        ]).onConflictDoNothing();
        await db.insert(messages).values({
          conversationId: conv.id,
          senderId: officialId,
          content: getWelcomeMessage(u.userType, u.sex),
          messageType: "text",
        });
      } catch (err: unknown) {
        logSeedError(`reconcile-conv-${u.id}`, err);
      }
    }
  }
}

export async function massSeedFakeUsers(): Promise<void> {
  if (massSeedStatus.running) return;

  seedErrors.length = 0;
  const allSpecs = buildSpecs();
  const TARGET = allSpecs.length;
  massSeedStatus = { running: true, created: 0, total: TARGET, error: null };
  const usedNicknames = new Set<string>();
  const usedEmails = new Set<string>();

  try {
    await storage.upsertAppSetting("skip_fake_user_seed", "false");
    const officialId = await ensureOfficialAccount();

    const existingTagged = await db.select({
      userType: users.userType,
      sex: users.sex,
      coupleSexConfig: users.coupleSexConfig,
      region: users.region,
    })
      .from(users)
      .where(eq(users.invitationCode, SEED_TAG));

    if (existingTagged.length > 0) {
      console.log(`[mass-seed] Found ${existingTagged.length} existing tagged users, reconciling...`);
      await reconcileExistingUsers(officialId);
    }

    const existingCounts = new Map<string, number>();
    for (const u of existingTagged) {
      const csc = u.coupleSexConfig ?? "none";
      const key = `${u.userType}_${u.sex}_${csc}_${u.region}`;
      existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
    }

    const specsToCreate: UserSpec[] = [];
    const specCountNeeded = new Map<string, number>();
    for (const spec of allSpecs) {
      const csc = spec.coupleSexConfig ?? "none";
      const catRegionKey = `${spec.userType}_${spec.sex}_${csc}_${spec.region}`;
      const alreadyCreated = existingCounts.get(catRegionKey) ?? 0;
      const alreadyAccounted = specCountNeeded.get(catRegionKey) ?? 0;
      if (alreadyAccounted < alreadyCreated) {
        specCountNeeded.set(catRegionKey, alreadyAccounted + 1);
      } else {
        specsToCreate.push(spec);
        specCountNeeded.set(catRegionKey, alreadyAccounted + 1);
      }
    }

    if (specsToCreate.length === 0) {
      massSeedStatus = { running: false, created: existingTagged.length, total: TARGET, error: null };
      return;
    }

    massSeedStatus.total = specsToCreate.length;

    const existingUsers = await db.select({ nickname: users.nickname, email: users.email }).from(users);
    for (const u of existingUsers) {
      usedNicknames.add(u.nickname.toLowerCase());
      usedEmails.add(u.email.toLowerCase());
    }

    const hashedPw = await bcrypt.hash("FakeUser2024!", 10);

    for (let batchStart = 0; batchStart < specsToCreate.length; batchStart += BATCH_SIZE) {
      const batch = specsToCreate.slice(batchStart, batchStart + BATCH_SIZE);

      const userRows: UserRow[] = [];
      const specMeta: SpecMeta[] = [];

      for (const spec of batch) {
        const nickname = generateUniqueNickname(spec.sex, usedNicknames);
        const email = generateUniqueEmail(nickname, usedEmails);
        userRows.push({
          nickname,
          email,
          password: hashedPw,
          userType: spec.userType,
          sex: spec.sex,
          coupleSexConfig: spec.coupleSexConfig,
          role: "user",
          status: "active",
          isFake: true,
          region: spec.region,
          birthYear: randBirthYear(),
          emailVerified: true,
          eulaAccepted: true,
          country: "IT",
          spokenLanguages: ["Italiano"],
          lastLoginAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
          invitationCode: SEED_TAG,
        });
        specMeta.push({ nickname, email, spec });
      }

      let insertedUsers: User[];
      try {
        insertedUsers = await db.insert(users).values(userRows).onConflictDoNothing().returning();
      } catch (err: unknown) {
        logSeedError("batch-user-insert", err);
        insertedUsers = [];
        for (const row of userRows) {
          try {
            const [u] = await db.insert(users).values(row).onConflictDoNothing().returning();
            if (u) insertedUsers.push(u);
          } catch (innerErr: unknown) {
            logSeedError("single-user-insert", innerErr);
          }
        }
      }

      const profileRows: ProfileRow[] = [];
      const motoRows: MotoRow[] = [];
      const wishlistInserts: { userId: string; spec: UserSpec }[] = [];
      const convInserts: { userId: string; spec: UserSpec }[] = [];

      for (const newUser of insertedUsers) {
        const meta = specMeta.find(m => m.nickname === newUser.nickname);
        const spec = meta?.spec;
        if (!spec) continue;

        const coords = REGION_COORDS[spec.region];
        profileRows.push({
          userId: newUser.id,
          isAvailable: Math.random() > 0.3,
          latitude: coords.lat + randOffset(),
          longitude: coords.lng + randOffset(),
          maxPickupDistance: 20 + Math.floor(Math.random() * 80),
          bio: getBio(spec.userType, spec.sex),
        });

        if (spec.userType === "biker" || spec.userType === "coppia") {
          const motos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          for (const moto of motos) {
            motoRows.push({
              userId: newUser.id,
              brand: moto.brand,
              model: moto.model,
              year: getMotoYear(),
              displacement: moto.displacement,
              motorcycleType: moto.type,
              ridingStyle: moto.style,
            });
          }
        }

        if (spec.userType === "zavorrina") {
          wishlistInserts.push({ userId: newUser.id, spec });
        }

        convInserts.push({ userId: newUser.id, spec });
      }

      if (profileRows.length > 0) {
        try {
          await db.insert(userProfiles).values(profileRows).onConflictDoNothing();
        } catch (err: unknown) {
          logSeedError("batch-profile-insert", err);
          for (const row of profileRows) {
            try { await db.insert(userProfiles).values(row).onConflictDoNothing(); }
            catch (innerErr: unknown) { logSeedError("single-profile-insert", innerErr); }
          }
        }
      }

      if (motoRows.length > 0) {
        try {
          await db.insert(userMotorcycles).values(motoRows);
        } catch (err: unknown) {
          logSeedError("batch-moto-insert", err);
          for (const row of motoRows) {
            try { await db.insert(userMotorcycles).values(row); }
            catch (innerErr: unknown) { logSeedError("single-moto-insert", innerErr); }
          }
        }
      }

      for (const wl of wishlistInserts) {
        try {
          const wishlist = await storage.createOrUpdateWishlist(wl.userId, "Cerco un biker per bei giri in moto");
          const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          const wishlistMotoValues: WishlistMotoRow[] = desiredMotos.map(m => ({
            wishlistId: wishlist.id,
            brand: m.brand,
            model: m.model,
            motorcycleType: m.type,
            ridingStyle: m.style,
          }));
          await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
        } catch (err: unknown) {
          logSeedError(`wishlist-insert-${wl.userId}`, err);
        }
      }

      if (convInserts.length > 0) {
        try {
          const convRows = convInserts.map(() => ({ conversationType: "private" as const }));
          const createdConvs = await db.insert(conversations).values(convRows).returning();

          const participantRows: { conversationId: string; userId: string }[] = [];
          const messageRows: { conversationId: string; senderId: string; content: string; messageType: string }[] = [];

          for (let i = 0; i < createdConvs.length; i++) {
            const conv = createdConvs[i];
            const ci = convInserts[i];
            participantRows.push(
              { conversationId: conv.id, userId: officialId },
              { conversationId: conv.id, userId: ci.userId },
            );
            messageRows.push({
              conversationId: conv.id,
              senderId: officialId,
              content: getWelcomeMessage(ci.spec.userType, ci.spec.sex),
              messageType: "text",
            });
          }

          if (participantRows.length > 0) {
            await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
          }
          if (messageRows.length > 0) {
            await db.insert(messages).values(messageRows);
          }
        } catch (err: unknown) {
          logSeedError("batch-conv-insert", err);
          for (const ci of convInserts) {
            try {
              const [conv] = await db.insert(conversations).values({ conversationType: "private" }).returning();
              await db.insert(conversationParticipants).values([
                { conversationId: conv.id, userId: officialId },
                { conversationId: conv.id, userId: ci.userId },
              ]).onConflictDoNothing();
              await db.insert(messages).values({
                conversationId: conv.id,
                senderId: officialId,
                content: getWelcomeMessage(ci.spec.userType, ci.spec.sex),
                messageType: "text",
              });
            } catch (innerErr: unknown) {
              logSeedError(`single-conv-insert-${ci.userId}`, innerErr);
            }
          }
        }
      }

      massSeedStatus.created += insertedUsers.length;

      if (batchStart % (BATCH_SIZE * 5) === 0) {
        console.log(`[mass-seed] Progress: ${massSeedStatus.created}/${massSeedStatus.total}`);
      }
    }

    const errorSummary = seedErrors.length > 0
      ? `Completato con ${seedErrors.length} errori parziali`
      : null;
    massSeedStatus.error = errorSummary;
    console.log(`[mass-seed] Complete: ${massSeedStatus.created} users created, ${seedErrors.length} errors`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    massSeedStatus.error = msg;
    console.error("[mass-seed] Fatal error:", error);
  } finally {
    massSeedStatus.running = false;
  }
}
