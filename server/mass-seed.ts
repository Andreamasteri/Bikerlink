import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import { storage } from "./storage";
import {
  users, userProfiles, userMotorcycles, zavorrinaWishlistMotos,
  conversations, conversationParticipants, messages,
  type User,
} from "@shared/db";
import { eq } from "drizzle-orm";
import {
  MOTORCYCLES,
  randOffset, randBirthYear, pickRandomN, getMotoYear, getBio, getWelcomeMessage,
  generateUniqueNickname, generateUniqueEmail,
} from "./mass-seed-data";
import {
  SEED_TAG, UserSpec, UserRow, ProfileRow, MotoRow, WishlistMotoRow, SpecMeta,
  buildSpecs, ensureOfficialAccount, cleanupOldSeedUsers, reconcileExistingUsers
} from "./mass-seed/seed-users";
import { seedClubMemberships } from "./mass-seed/seed-clubs";
import { reloadSimulatorUsers } from "./motion-simulator";

interface MassSeedStatus {
  running: boolean;
  created: number;
  total: number;
  error: string | null;
}

let massSeedStatus: MassSeedStatus = { running: false, created: 0, total: 0, error: null };

export async function getMassSeedStatus(): Promise<MassSeedStatus> {
  if (!massSeedStatus.running && massSeedStatus.created === 0) {
    try {
      const checkpoint = await storage.getAppSetting("mass_seed_created_checkpoint");
      if (checkpoint?.value) {
        const saved = parseInt(checkpoint.value, 10);
        if (!isNaN(saved) && saved > 0) {
          return { ...massSeedStatus, created: saved, total: 5000 };
        }
      }
    } catch { /* no-op: setting might not exist */ }
  }
  return { ...massSeedStatus };
}

const BATCH_SIZE = 50;
const seedErrors: string[] = [];

function logSeedError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const entry = `[${context}] ${msg}`;
  seedErrors.push(entry);
  console.error(`[mass-seed] ${entry}`);
}

async function cleanAllFakeUsers(): Promise<void> {
  console.log("[mass-seed] Cleaning all fake users from DB...");

  const mismarkedResult = await pool.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt FROM users
    WHERE is_fake = true
      AND role NOT IN ('admin', 'moderator')
      AND email NOT LIKE '%@fakeuser.bikerlink.it'
      AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
  `);
  const mismarkedCount = parseInt(mismarkedResult.rows[0]?.cnt ?? "0", 10);
  if (mismarkedCount > 0) {
    throw new Error(
      `[mass-seed] BLOCKED: ${mismarkedCount} real user(s) are incorrectly marked as isFake=true. ` +
      `Run POST /api/admin/users/fix-isfake to remediate before seeding.`
    );
  }

  await pool.query("DELETE FROM users WHERE is_fake = true");
  await pool.query(`
    DELETE FROM conversations
    WHERE id NOT IN (
      SELECT DISTINCT conversation_id FROM conversation_participants
    )
  `);
  console.log("[mass-seed] Fake user cleanup complete.");
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

    await cleanAllFakeUsers();

    await cleanupOldSeedUsers(logSeedError);

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
      await reconcileExistingUsers(officialId, logSeedError);
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
    if (existingTagged.length > 0) {
      storage.upsertAppSetting("mass_seed_created_checkpoint", existingTagged.length.toString()).catch(() => {});
    }

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
        const userLat = spec.lat + randOffset();
        const userLng = spec.lng + randOffset();
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
          firstLoginLat: userLat,
          firstLoginLng: userLng,
        });
        specMeta.push({ nickname, email, spec, lat: userLat, lng: userLng });
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
        if (!spec || !meta) continue;

        profileRows.push({
          userId: newUser.id,
          isAvailable: Math.random() > 0.3,
          latitude: meta.lat,
          longitude: meta.lng,
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
          await db.insert(zavorrinaWishlistMotos).values(wishlistMotoValues);
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

      await seedClubMemberships(insertedUsers, specMeta, logSeedError);

      massSeedStatus.created += batch.length;
      if (massSeedStatus.created % (BATCH_SIZE * 4) === 0) {
        console.log(`[mass-seed] Global progress: ${massSeedStatus.created}/${TARGET}`);
        storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 10));
    }

    console.log(`[mass-seed] SUCCESS: Seeded ${massSeedStatus.created} users.`);
    massSeedStatus.running = false;
    storage.upsertAppSetting("mass_seed_created_checkpoint", massSeedStatus.created.toString()).catch(() => {});
    reloadSimulatorUsers().catch((e: unknown) => {
      console.error("[mass-seed] reloadSimulatorUsers error:", e);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    massSeedStatus.error = msg;
    massSeedStatus.running = false;
    console.error(`[mass-seed] FATAL ERROR: ${msg}`);
  }
}
