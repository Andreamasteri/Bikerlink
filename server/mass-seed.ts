import bcrypt from "bcryptjs";
import { db } from "./db";
import { storage } from "./storage";
import {
  users, userProfiles, userMotorcycles, zavarrinaWishlists, zavarrinaWishlistMotos,
  conversations, conversationParticipants, messages,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  REGIONS, REGION_COORDS, MALE_NAMES, FEMALE_NAMES, SURNAMES, MOTORCYCLES,
  randOffset, randBirthYear, pickRandom, pickRandomN, getMotoYear, getBio, getWelcomeMessage,
  distributeUniformly,
} from "./mass-seed-data";

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
  coupleSexConfig?: string | null;
  region: string;
}

function buildSpecs(): UserSpec[] {
  const specs: UserSpec[] = [];
  const categories: { userType: "biker" | "zavorrina" | "coppia"; sex: "M" | "F"; coupleSexConfig?: string; count: number }[] = [
    { userType: "biker", sex: "M", count: 1500 },
    { userType: "biker", sex: "F", count: 200 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+F", count: 100 },
    { userType: "coppia", sex: "M", coupleSexConfig: "M+M", count: 50 },
    { userType: "coppia", sex: "F", coupleSexConfig: "F+F", count: 20 },
    { userType: "zavorrina", sex: "F", count: 500 },
    { userType: "zavorrina", sex: "M", count: 50 },
  ];

  for (const cat of categories) {
    const distribution = distributeUniformly(cat.count, REGIONS.length);
    for (let r = 0; r < REGIONS.length; r++) {
      for (let i = 0; i < distribution[r]; i++) {
        specs.push({
          userType: cat.userType,
          sex: cat.sex,
          coupleSexConfig: cat.coupleSexConfig ?? null,
          region: REGIONS[r],
        });
      }
    }
  }

  return specs.sort(() => Math.random() - 0.5);
}

let usedNicknames = new Set<string>();
let usedEmails = new Set<string>();

function generateUniqueNickname(sex: string): string {
  const names = sex === "F" ? FEMALE_NAMES : MALE_NAMES;
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = pickRandom(names);
    const surname = pickRandom(SURNAMES);
    const suffix = Math.floor(Math.random() * 999);
    const nick = `${name}${surname}${suffix}`;
    if (!usedNicknames.has(nick.toLowerCase())) {
      usedNicknames.add(nick.toLowerCase());
      return nick;
    }
  }
  const fallback = `User${Date.now()}${Math.floor(Math.random() * 9999)}`;
  usedNicknames.add(fallback.toLowerCase());
  return fallback;
}

function generateUniqueEmail(nickname: string): string {
  const domains = ["gmail.com", "yahoo.it", "libero.it", "hotmail.it", "outlook.com", "alice.it", "tiscali.it"];
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `${Math.floor(Math.random() * 9999)}`;
    const email = `${nickname.toLowerCase()}${suffix}@${pickRandom(domains)}`;
    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }
  }
  const email = `${nickname.toLowerCase()}.${Date.now()}@${pickRandom(domains)}`;
  usedEmails.add(email);
  return email;
}

async function ensureOfficialAccount(): Promise<string> {
  const existing = await storage.getUserByNickname("BikerLink_Official");
  if (existing) return existing.id;

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

export async function massSeedFakeUsers(): Promise<void> {
  if (massSeedStatus.running) return;

  const specs = buildSpecs();
  massSeedStatus = { running: true, created: 0, total: specs.length, error: null };
  usedNicknames = new Set<string>();
  usedEmails = new Set<string>();

  try {
    const [fakeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.isFake, true));
    if ((fakeCount?.count ?? 0) >= 2400) {
      massSeedStatus = { running: false, created: 0, total: specs.length, error: "Ci sono già 2400+ utenti fake nel sistema. Elimina quelli esistenti prima di rigenerare." };
      return;
    }

    const existingUsers = await db.select({ nickname: users.nickname, email: users.email }).from(users);
    for (const u of existingUsers) {
      usedNicknames.add(u.nickname.toLowerCase());
      usedEmails.add(u.email.toLowerCase());
    }

    await storage.upsertAppSetting("skip_fake_user_seed", "false");

    const officialId = await ensureOfficialAccount();
    const hashedPw = await bcrypt.hash("FakeUser2024!", 10);

    for (let batchStart = 0; batchStart < specs.length; batchStart += BATCH_SIZE) {
      const batch = specs.slice(batchStart, batchStart + BATCH_SIZE);

      const userRows: any[] = [];
      const specMeta: { nickname: string; email: string; spec: UserSpec }[] = [];

      for (const spec of batch) {
        const nickname = generateUniqueNickname(spec.sex);
        const email = generateUniqueEmail(nickname);
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
        });
        specMeta.push({ nickname, email, spec });
      }

      let insertedUsers: any[];
      try {
        insertedUsers = await db.insert(users).values(userRows).onConflictDoNothing().returning();
      } catch (err: any) {
        console.error(`[mass-seed] Batch insert error, falling back to individual:`, err?.message);
        insertedUsers = [];
        for (const row of userRows) {
          try {
            const [u] = await db.insert(users).values(row).onConflictDoNothing().returning();
            if (u) insertedUsers.push(u);
          } catch {}
        }
      }

      const profileRows: any[] = [];
      const motoRows: any[] = [];
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
        } catch (err: any) {
          for (const row of profileRows) {
            try { await db.insert(userProfiles).values(row).onConflictDoNothing(); } catch {}
          }
        }
      }

      if (motoRows.length > 0) {
        try {
          await db.insert(userMotorcycles).values(motoRows);
        } catch (err: any) {
          for (const row of motoRows) {
            try { await db.insert(userMotorcycles).values(row); } catch {}
          }
        }
      }

      for (const wl of wishlistInserts) {
        try {
          const wishlist = await storage.createOrUpdateWishlist(wl.userId, "Cerco un biker per bei giri in moto");
          const desiredMotos = pickRandomN(MOTORCYCLES, 2 + Math.floor(Math.random() * 2));
          const wishlistMotoValues = desiredMotos.map(m => ({
            wishlistId: wishlist.id,
            brand: m.brand,
            model: m.model,
            motorcycleType: m.type,
            ridingStyle: m.style,
          }));
          await db.insert(zavarrinaWishlistMotos).values(wishlistMotoValues);
        } catch {}
      }

      const convRows: any[] = [];
      for (const ci of convInserts) {
        convRows.push({ conversationType: "private" as const });
      }

      if (convRows.length > 0) {
        try {
          const createdConvs = await db.insert(conversations).values(convRows).returning();

          const participantRows: any[] = [];
          const messageRows: any[] = [];

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
        } catch (err: any) {
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
            } catch {}
          }
        }
      }

      massSeedStatus.created += insertedUsers.length;

      if (batchStart % (BATCH_SIZE * 5) === 0) {
        console.log(`[mass-seed] Progress: ${massSeedStatus.created}/${massSeedStatus.total}`);
      }
    }

    console.log(`[mass-seed] Complete: ${massSeedStatus.created} users created`);
  } catch (error: any) {
    massSeedStatus.error = error?.message || "Errore sconosciuto";
    console.error("[mass-seed] Fatal error:", error);
  } finally {
    massSeedStatus.running = false;
    usedNicknames.clear();
    usedEmails.clear();
  }
}
