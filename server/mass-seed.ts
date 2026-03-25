import bcrypt from "bcryptjs";
import { db } from "./db";
import { storage } from "./storage";
import {
  users, userProfiles, userMotorcycles, zavarrinaWishlists, zavarrinaWishlistMotos,
  conversations, conversationParticipants, messages, motoClubs, motoClubMembers,
  type User,
} from "@shared/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import {
  EUROPEAN_ZONES, MOTORCYCLES,
  randOffset, randBirthYear, pickRandom, pickRandomN, getMotoYear, getBio, getWelcomeMessage,
  distributeUniformly, generateUniqueNickname, generateUniqueEmail,
} from "./mass-seed-data";

const SEED_TAG = "mass_seed_5k_v1";
const OLD_SEED_TAGS = ["mass_seed_eu_v1", "mass_seed_2420"];

interface MassSeedStatus {
  running: boolean;
  created: number;
  total: number;
  error: string | null;
}

let massSeedStatus: MassSeedStatus = { running: false, created: 0, total: 0, error: null };

export async function getMassSeedStatus(): Promise<MassSeedStatus> {
  if (!massSeedStatus.running && massSeedStatus.created === 0 && massSeedStatus.total === 0) {
    try {
      const checkpoint = await storage.getAppSetting("mass_seed_created_checkpoint");
      if (checkpoint?.value) {
        const saved = parseInt(checkpoint.value, 10);
        if (!isNaN(saved) && saved > 0) {
          return { ...massSeedStatus, created: saved, total: 5000 };
        }
      }
    } catch {}
  }
  return { ...massSeedStatus };
}

const BATCH_SIZE = 50;

interface UserSpec {
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
          specKey: `${cat.userType}_${cat.sex}_${csc}_${zone.region}_${catIndex}`,
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

async function cleanupOldSeedUsers(): Promise<void> {
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
        await db.delete(zavarrinaWishlistMotos)
          .where(sql`${zavarrinaWishlistMotos.wishlistId} IN (SELECT id FROM zavorrina_wishlists WHERE user_id = ${uid})`);
        await db.delete(zavarrinaWishlists).where(eq(zavarrinaWishlists.userId, uid));
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
        logSeedError(`cleanup-old-user-${uid}`, err);
      }
    }

    if (i % (CLEANUP_BATCH * 5) === 0 && i > 0) {
      console.log(`[mass-seed] Cleanup progress: ${i}/${oldTaggedUsers.length}`);
    }
  }

  console.log(`[mass-seed] Cleanup complete: removed ${oldTaggedUsers.length} old seed users`);
}

async function reconcileExistingUsers(officialId: string): Promise<void> {
  const taggedUsers = await db.select({
    id: users.id, userType: users.userType, sex: users.sex, nickname: users.nickname,
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
    db.select({ userId: zavarrinaWishlists.userId })
      .from(zavarrinaWishlists)
      .where(inArray(zavarrinaWishlists.userId, taggedIds)),
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
    userId: conversationParticipants.userId,
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
        bio: getBio(u.userType, u.sex),
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
            ridingStyle: moto.style,
          });
        }
      }
    }
  }

  if (missingProfileRows.length > 0) {
    try {
      await db.insert(userProfiles).values(missingProfileRows).onConflictDoNothing();
    } catch (err: unknown) {
      logSeedError("reconcile-bulk-profiles", err);
    }
  }

  if (missingMotoRows.length > 0) {
    try {
      await db.insert(userMotorcycles).values(missingMotoRows);
    } catch (err: unknown) {
      logSeedError("reconcile-bulk-motos", err);
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
        ridingStyle: m.style,
      }));
      await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
    } catch (err: unknown) {
      logSeedError(`reconcile-wishlist-${u.id}`, err);
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
      logSeedError(`reconcile-conv-batch-${i}`, err);
    }
    await new Promise(r => setTimeout(r, 5));
  }

  console.log(`[mass-seed] Reconcile complete: ${taggedUsers.length} users checked, ${missingProfileRows.length} profiles added, ${usersNeedingConv.length} convs added`);
}

export async function massSeedFakeUsers(): Promise<void> {
  if (massSeedStatus.running) return;

  seedErrors.length = 0;
  const allSpecs = buildSpecs();
  const TARGET = allSpecs.length;
  massSeedStatus = { running: true, created: 0, total: TARGET, error: null };
  storage.upsertAppSetting("mass_seed_created_checkpoint", "0").catch(() => {});
  const usedNicknames = new Set<string>();
  const usedEmails = new Set<string>();

  try {
    await storage.upsertAppSetting("skip_fake_user_seed", "false");

    await cleanupOldSeedUsers();

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
      massSeedStatus = { running: false, created: TARGET, total: TARGET, error: null };
      return;
    }

    massSeedStatus.created = existingTagged.length;

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
          country: spec.country,
          spokenLanguages: spec.spokenLanguages,
          lastLoginAt: new Date(),
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

        profileRows.push({
          userId: newUser.id,
          isAvailable: Math.random() > 0.3,
          latitude: spec.lat + randOffset(),
          longitude: spec.lng + randOffset(),
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

      if (insertedUsers.length > 0) {
        try {
          const approvedClubs = await db
            .select({ id: motoClubs.id, conversationId: motoClubs.conversationId, clubType: motoClubs.clubType, region: motoClubs.region })
            .from(motoClubs)
            .innerJoin(conversations, eq(motoClubs.conversationId, conversations.id))
            .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "brand")));

          const approvedRegionalClubs = await db
            .select({ id: motoClubs.id, conversationId: motoClubs.conversationId, region: motoClubs.region })
            .from(motoClubs)
            .innerJoin(conversations, eq(motoClubs.conversationId, conversations.id))
            .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "region")));

          const regionalClubByRegion = new Map(approvedRegionalClubs.map(c => [c.region, c]));

          const clubMemberRows: { clubId: string; userId: string; role: string; status: string }[] = [];
          const convParticipantRows: { conversationId: string; userId: string }[] = [];

          for (const newUser of insertedUsers) {
            const meta = specMeta.find(m => m.nickname === newUser.nickname);
            const spec = meta?.spec;

            if (approvedClubs.length > 0) {
              const count = 1 + Math.floor(Math.random() * 2);
              const shuffled = [...approvedClubs].sort(() => Math.random() - 0.5).slice(0, count);
              for (const club of shuffled) {
                clubMemberRows.push({ clubId: club.id, userId: newUser.id, role: "member", status: "active" });
                if (club.conversationId) {
                  convParticipantRows.push({ conversationId: club.conversationId, userId: newUser.id });
                }
              }
            }

            if (spec?.region && spec.country === "IT") {
              const regionalClub = regionalClubByRegion.get(spec.region);
              if (regionalClub) {
                clubMemberRows.push({ clubId: regionalClub.id, userId: newUser.id, role: "member", status: "active" });
                if (regionalClub.conversationId) {
                  convParticipantRows.push({ conversationId: regionalClub.conversationId, userId: newUser.id });
                }
              }
            }
          }

          if (clubMemberRows.length > 0) {
            try {
              await db.insert(motoClubMembers).values(clubMemberRows).onConflictDoNothing();
            } catch (err: unknown) {
              logSeedError("batch-club-member-insert", err);
            }
          }
          if (convParticipantRows.length > 0) {
            try {
              await db.insert(conversationParticipants).values(convParticipantRows).onConflictDoNothing();
            } catch (err: unknown) {
              logSeedError("batch-conv-participant-insert", err);
            }
          }
        } catch (err: unknown) {
          logSeedError("batch-club-query", err);
        }
      }

      massSeedStatus.created += insertedUsers.length;

      if (batchStart % (BATCH_SIZE * 5) === 0) {
        console.log(`[mass-seed] Progress: ${massSeedStatus.created}/${massSeedStatus.total}`);
        storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {});
      }

      await new Promise(r => setTimeout(r, 10));
    }

    const errorSummary = seedErrors.length > 0
      ? `Completato con ${seedErrors.length} errori parziali`
      : null;
    massSeedStatus.error = errorSummary;
    storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {});
    console.log(`[mass-seed] Complete: ${massSeedStatus.created} users created, ${seedErrors.length} errors`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    massSeedStatus.error = msg;
    console.error("[mass-seed] Fatal error:", error);
  } finally {
    massSeedStatus.running = false;
  }
}
