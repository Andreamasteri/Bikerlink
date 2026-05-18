import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { allLimited } from "../lib/concurrency";
import { getRegionCenter } from "../../constants/regionCenters";
import {
  motoClubs,
  motoClubMembers,
  motoClubInvites,
  motoClubRequests,
  feedbackTickets,
  conversations,
  conversationParticipants,
  messages,
  routes,
  users,
  userProfiles,
  userMotorcycles,
} from "@shared/schema";
import { eq, and, ilike, or, sql, desc, ne, count, notInArray } from "drizzle-orm";
import { PROTECTED_NICKNAMES } from "../constants";
import { systemAccountConditions } from "../lib/system-account-filter";
import { sendEmail } from "../email";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

const SEED_BRANDS = [
  { name: "Ducati", brandName: "Ducati", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Ducati_red_logo.svg/200px-Ducati_red_logo.svg.png" },
  { name: "BMW Motorrad", brandName: "BMW", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/200px-BMW.svg.png" },
  { name: "Harley-Davidson", brandName: "Harley-Davidson", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Harley-Davidson_logo.svg/200px-Harley-Davidson_logo.svg.png" },
  { name: "Honda", brandName: "Honda", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Honda.svg/200px-Honda.svg.png" },
  { name: "Yamaha", brandName: "Yamaha", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Yamaha_logo.svg/200px-Yamaha_logo.svg.png" },
  { name: "Kawasaki", brandName: "Kawasaki", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Kawasaki-logo.svg/200px-Kawasaki-logo.svg.png" },
  { name: "Suzuki", brandName: "Suzuki", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Suzuki_logo_2.svg/200px-Suzuki_logo_2.svg.png" },
  { name: "KTM", brandName: "KTM", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/KTM_Logo.svg/200px-KTM_Logo.svg.png" },
  { name: "Triumph", brandName: "Triumph", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Triumph_Motorcycles_logo.svg/200px-Triumph_Motorcycles_logo.svg.png" },
  { name: "Aprilia", brandName: "Aprilia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Aprilia-logo.svg/200px-Aprilia-logo.svg.png" },
  { name: "Moto Guzzi", brandName: "Moto Guzzi", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Moto_Guzzi_logo.svg/200px-Moto_Guzzi_logo.svg.png" },
  { name: "MV Agusta", brandName: "MV Agusta", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/MV_Agusta_logo.svg/200px-MV_Agusta_logo.svg.png" },
  { name: "Royal Enfield", brandName: "Royal Enfield", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Royal-Enfield-Logo.svg/200px-Royal-Enfield-Logo.svg.png" },
  { name: "Indian Motorcycle", brandName: "Indian", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Indian_Motorcycle_logo.svg/200px-Indian_Motorcycle_logo.svg.png" },
  { name: "Benelli", brandName: "Benelli", logoUrl: null },
  { name: "Norton", brandName: "Norton", logoUrl: null },
  { name: "Husqvarna", brandName: "Husqvarna", logoUrl: null },
  { name: "Gas Gas", brandName: "Gas Gas", logoUrl: null },
  { name: "Moto Morini", brandName: "Moto Morini", logoUrl: null },
  { name: "Zero Motorcycles", brandName: "Zero", logoUrl: null },
];

const SEED_REGIONS = [
  { region: "Piemonte", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Coat_of_arms_of_Piedmont.svg/150px-Coat_of_arms_of_Piedmont.svg.png" },
  { region: "Valle d'Aosta", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Coat_of_arms_of_Aosta_Valley.svg/150px-Coat_of_arms_of_Aosta_Valley.svg.png" },
  { region: "Lombardia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Coat_of_arms_of_Lombardy.svg/150px-Coat_of_arms_of_Lombardy.svg.png" },
  { region: "Trentino-Alto Adige", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Coat_of_Arms_of_Trentino-Alto_Adige.svg/150px-Coat_of_Arms_of_Trentino-Alto_Adige.svg.png" },
  { region: "Veneto", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Coat_of_arms_of_Veneto.svg/150px-Coat_of_arms_of_Veneto.svg.png" },
  { region: "Friuli-Venezia Giulia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Coat_of_arms_of_Friuli-Venezia_Giulia.svg/150px-Coat_of_arms_of_Friuli-Venezia_Giulia.svg.png" },
  { region: "Liguria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Coat_of_arms_of_Liguria.svg/150px-Coat_of_arms_of_Liguria.svg.png" },
  { region: "Emilia-Romagna", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Coat_of_arms_of_Emilia-Romagna.svg/150px-Coat_of_arms_of_Emilia-Romagna.svg.png" },
  { region: "Toscana", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Coat_of_arms_of_Tuscany.svg/150px-Coat_of_arms_of_Tuscany.svg.png" },
  { region: "Umbria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Coat_of_arms_of_Umbria.svg/150px-Coat_of_arms_of_Umbria.svg.png" },
  { region: "Marche", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Coat_of_arms_of_Marche.svg/150px-Coat_of_arms_of_Marche.svg.png" },
  { region: "Lazio", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Coat_of_arms_of_Lazio.svg/150px-Coat_of_arms_of_Lazio.svg.png" },
  { region: "Abruzzo", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Coat_of_arms_of_Abruzzo.svg/150px-Coat_of_arms_of_Abruzzo.svg.png" },
  { region: "Molise", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Coat_of_arms_of_Molise.svg/150px-Coat_of_arms_of_Molise.svg.png" },
  { region: "Campania", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Coat_of_arms_of_Campania.svg/150px-Coat_of_arms_of_Campania.svg.png" },
  { region: "Puglia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Coat_of_arms_of_Apulia.svg/150px-Coat_of_arms_of_Apulia.svg.png" },
  { region: "Basilicata", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Coat_of_arms_of_Basilicata.svg/150px-Coat_of_arms_of_Basilicata.svg.png" },
  { region: "Calabria", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Coat_of_arms_of_Calabria.svg/150px-Coat_of_arms_of_Calabria.svg.png" },
  { region: "Sicilia", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Coat_of_Arms_of_Sicily.svg/150px-Coat_of_Arms_of_Sicily.svg.png" },
  { region: "Sardegna", logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Coat_of_arms_of_Sardinia.svg/150px-Coat_of_arms_of_Sardinia.svg.png" },
];

async function seedMotoclubs() {
  try {
    const [{ brandCount }] = await db
      .select({ brandCount: sql<number>`count(*)` })
      .from(motoClubs)
      .where(eq(motoClubs.clubType, "brand"));
    const [{ regionCount }] = await db
      .select({ regionCount: sql<number>`count(*)` })
      .from(motoClubs)
      .where(eq(motoClubs.clubType, "region"));

    if (Number(brandCount) === 0) {
      for (const b of SEED_BRANDS) {
        await db.insert(motoClubs).values({
          name: b.name,
          clubType: "brand",
          brandName: b.brandName,
          logoUrl: b.logoUrl ?? null,
          isApproved: true,
          activityScore: 0,
        });
      }
      console.log("[Motoclub] Seed brand:", SEED_BRANDS.length, "club");
    } else {
      // Repair: insert individual brand clubs that may be missing (e.g. BMW was absent while Ducati existed)
      let repaired = 0;
      for (const b of SEED_BRANDS) {
        const existing = await db.select({ id: motoClubs.id })
          .from(motoClubs)
          .where(and(eq(motoClubs.clubType, "brand"), ilike(motoClubs.brandName!, b.brandName)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(motoClubs).values({
            name: b.name,
            clubType: "brand",
            brandName: b.brandName,
            logoUrl: b.logoUrl ?? null,
            isApproved: true,
            activityScore: 0,
          });
          repaired++;
          console.log("[Motoclub] Repair: aggiunto club brand mancante:", b.name);
        }
      }
      if (repaired > 0) console.log("[Motoclub] Repair brand completato:", repaired, "club aggiunti");
    }

    if (Number(regionCount) === 0) {
      for (const r of SEED_REGIONS) {
        await db.insert(motoClubs).values({
          name: `Motoclub ${r.region}`,
          clubType: "region",
          region: r.region,
          country: "IT",
          logoUrl: r.logoUrl,
          isApproved: true,
          activityScore: 0,
        });
      }
      console.log("[Motoclub] Seed regionali:", SEED_REGIONS.length, "club");
    } else {
      // Repair: insert individual region clubs that may be missing
      let repaired = 0;
      for (const r of SEED_REGIONS) {
        const existing = await db.select({ id: motoClubs.id })
          .from(motoClubs)
          .where(and(eq(motoClubs.clubType, "region"), ilike(motoClubs.region!, r.region)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(motoClubs).values({
            name: `Motoclub ${r.region}`,
            clubType: "region",
            region: r.region,
            country: "IT",
            logoUrl: r.logoUrl,
            isApproved: true,
            activityScore: 0,
          });
          repaired++;
          console.log("[Motoclub] Repair: aggiunto club regionale mancante:", r.region);
        }
      }
      if (repaired > 0) console.log("[Motoclub] Repair regionali completato:", repaired, "club aggiunti");
    }
  } catch (e) {
    console.error("[Motoclub seed error]", e);
  }
}

export { seedMotoclubs };

export async function createRegionalClubInvite(userId: string, region: string): Promise<void> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;

    const [regionalClub] = await db.select()
      .from(motoClubs)
      .where(
        and(
          eq(motoClubs.isApproved, true),
          eq(motoClubs.clubType, "region"),
          eq(motoClubs.region!, region)
        )
      )
      .limit(1);

    if (!regionalClub) return;

    // Blocca solo se è ancora membro ATTIVO (non se ha lasciato il club)
    const isMember = await db.select()
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, regionalClub.id),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active")
      ))
      .limit(1);
    if (isMember.length > 0) return;

    // Blocca solo se c'è già un invito PENDING (non se è stato declined)
    const existingInvite = await db.select()
      .from(motoClubInvites)
      .where(and(
        eq(motoClubInvites.clubId, regionalClub.id),
        eq(motoClubInvites.userId, userId),
        eq(motoClubInvites.status, "pending")
      ))
      .limit(1);
    if (existingInvite.length > 0) return;

    if (user.autoJoinClubs === false) {
      // Invito pending: riattiva declined esistente o crea nuovo
      const declinedRegional = await db.select({ id: motoClubInvites.id })
        .from(motoClubInvites)
        .where(and(
          eq(motoClubInvites.clubId, regionalClub.id),
          eq(motoClubInvites.userId, userId),
          eq(motoClubInvites.status, "declined")
        ))
        .limit(1);
      if (declinedRegional.length > 0) {
        await db.update(motoClubInvites)
          .set({ status: "pending" })
          .where(eq(motoClubInvites.id, declinedRegional[0].id));
      } else {
        await db.insert(motoClubInvites)
          .values({ clubId: regionalClub.id, userId, status: "pending" });
      }
      await storage.createNotification({
        userId,
        title: "Invito al club regionale",
        body: `Sei stato invitato nel club "${regionalClub.name}"`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: regionalClub.id,
      });
      return;
    }

    // Auto-join diretto: upsert per riattivare anche i left
    await db.insert(motoClubMembers)
      .values({ clubId: regionalClub.id, userId, status: "active" })
      .onConflictDoUpdate({
        target: [motoClubMembers.clubId, motoClubMembers.userId],
        set: { status: "active", joinedAt: new Date(), updatedAt: new Date() },
      });

    let convId = regionalClub.conversationId;
    if (!convId) convId = await createClubConversation(regionalClub.id, regionalClub.name);
    if (convId) await addMemberToConversation(convId, userId);

    await db.update(motoClubs)
      .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
      .where(eq(motoClubs.id, regionalClub.id));

    await storage.createNotification({
      userId,
      title: "Sei entrato nel club!",
      body: `Benvenuto nel club regionale "${regionalClub.name}" 🏍️`,
      notificationType: "motoclub_invite",
      referenceType: "motoclub",
      referenceId: regionalClub.id,
    });
  } catch (e) {
    console.error("[createRegionalClubInvite error]", e);
  }
}

export async function createClubInvitesForMoto(userId: string, brand: string, model: string) {
  try {
    const user = await storage.getUser(userId);
    if (!user) return;

    const matchingClubs = await db.select()
      .from(motoClubs)
      .where(
        and(
          eq(motoClubs.isApproved, true),
          eq(motoClubs.clubType, "brand"),
          or(
            ilike(motoClubs.brandName!, brand),
            sql`${motoClubs.brandName} ilike ${'%' + brand + '%'}`,
            sql`${brand} ilike '%' || ${motoClubs.brandName} || '%'`
          )
        )
      );

    for (const club of matchingClubs) {
      // Blocca solo se è ancora membro ATTIVO (non se ha lasciato il club)
      const isMember = await db.select()
        .from(motoClubMembers)
        .where(and(
          eq(motoClubMembers.clubId, club.id),
          eq(motoClubMembers.userId, userId),
          eq(motoClubMembers.status, "active")
        ))
        .limit(1);
      if (isMember.length > 0) continue;

      // Blocca solo se c'è già un invito PENDING (non se è stato declined)
      const existingInvite = await db.select()
        .from(motoClubInvites)
        .where(and(
          eq(motoClubInvites.clubId, club.id),
          eq(motoClubInvites.userId, userId),
          eq(motoClubInvites.status, "pending")
        ))
        .limit(1);
      if (existingInvite.length > 0) continue;

      if (user.autoJoinClubs === false) {
        // Invito pending: riattiva declined esistente o crea nuovo
        const declinedBrand = await db.select({ id: motoClubInvites.id })
          .from(motoClubInvites)
          .where(and(
            eq(motoClubInvites.clubId, club.id),
            eq(motoClubInvites.userId, userId),
            eq(motoClubInvites.status, "declined")
          ))
          .limit(1);
        if (declinedBrand.length > 0) {
          await db.update(motoClubInvites)
            .set({ status: "pending" })
            .where(eq(motoClubInvites.id, declinedBrand[0].id));
        } else {
          await db.insert(motoClubInvites)
            .values({ clubId: club.id, userId, status: "pending" });
        }
        await storage.createNotification({
          userId,
          title: "Invito al club",
          body: `Sei stato invitato nel club "${club.name}"`,
          notificationType: "motoclub_invite",
          referenceType: "motoclub",
          referenceId: club.id,
        });
        continue;
      }

      // Auto-join diretto: upsert per riattivare anche i left
      await db.insert(motoClubMembers)
        .values({ clubId: club.id, userId, status: "active" })
        .onConflictDoUpdate({
          target: [motoClubMembers.clubId, motoClubMembers.userId],
          set: { status: "active", joinedAt: new Date(), updatedAt: new Date() },
        });

      let convId = club.conversationId;
      if (!convId) convId = await createClubConversation(club.id, club.name);
      if (convId) await addMemberToConversation(convId, userId);

      await db.update(motoClubs)
        .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
        .where(eq(motoClubs.id, club.id));

      await storage.createNotification({
        userId,
        title: "Sei entrato nel club!",
        body: `Benvenuto nel club "${club.name}" — hai una ${brand} 🏍️`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: club.id,
      });
    }
  } catch (e) {
    console.error("[createClubInvites error]", e);
  }
}

async function createClubConversation(clubId: string, clubName: string) {
  const existing = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
  if (!existing[0] || existing[0].conversationId) return existing[0]?.conversationId ?? null;

  const [conv] = await db.insert(conversations).values({
    conversationType: "motoclub",
    title: `Club ${clubName}`,
  }).returning();

  await db.update(motoClubs)
    .set({ conversationId: conv.id, updatedAt: new Date() })
    .where(eq(motoClubs.id, clubId));

  return conv.id;
}

async function addMemberToConversation(conversationId: string, userId: string) {
  await db.insert(conversationParticipants).values({
    conversationId,
    userId,
  }).onConflictDoNothing();
}

async function removeMemberFromConversation(conversationId: string, userId: string) {
  await db.delete(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId)
    ));
}

async function notifyTopMembersOfNewJoin(clubId: string, newUserId: string, clubName: string) {
  try {
    const club = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club[0]?.conversationId) return;

    const convId = club[0].conversationId;
    const topSenders = await db.select({
      senderId: messages.senderId,
      count: sql<number>`count(*)::int`,
    })
      .from(messages)
      .where(and(eq(messages.conversationId, convId), ne(messages.senderId, newUserId)))
      .groupBy(messages.senderId)
      .orderBy(desc(sql`count(*)`))
      .limit(3);

    const newUser = await storage.getUser(newUserId);
    for (const row of topSenders) {
      await storage.createNotification({
        userId: row.senderId,
        title: `Nuovo membro in ${clubName}!`,
        body: `${newUser?.nickname ?? "Un nuovo utente"} è entrato nel tuo club`,
        notificationType: "motoclub_join",
        referenceType: "motoclub",
        referenceId: clubId,
      });
    }
  } catch (e) {
    console.error("[notifyTopMembers error]", e);
  }
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, search, country, region, language } = req.query as Record<string, string>;

    let query = db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    }).from(motoClubs).where(eq(motoClubs.isApproved, true));

    const conditions: any[] = [eq(motoClubs.isApproved, true)];

    if (type) conditions.push(eq(motoClubs.clubType, type));
    if (search) conditions.push(or(ilike(motoClubs.name, `%${search}%`), ilike(motoClubs.brandName, `%${search}%`), ilike(motoClubs.modelName, `%${search}%`)));

    const clubs = await db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    })
      .from(motoClubs)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${motoClubs.clubType} WHEN 'brand' THEN 1 WHEN 'model' THEN 2 WHEN 'custom' THEN 3 WHEN 'region' THEN 4 ELSE 5 END`,
        desc(motoClubs.activityScore),
        motoClubs.name
      );

    let result = clubs.map(r => ({ ...r.club, memberCount: r.memberCount }));

    if (country || region || language) {
      const memberCountsByClub: Record<string, number> = {};

      const filteredClubIds = await allLimited(
        result.map((club) => async () => {
          const memberQuery = db.select({ u: users })
            .from(motoClubMembers)
            .innerJoin(users, eq(users.id, motoClubMembers.userId))
            .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)));

          const members = await memberQuery;
          const filtered = members.filter(({ u }) => {
            if (country && u.country?.toUpperCase() !== country.toUpperCase()) return false;
            if (region && !u.region?.toLowerCase().includes(region.toLowerCase())) return false;
            if (language) {
              const langs = (u.spokenLanguages as string[] | null) ?? [];
              if (!langs.includes(language)) return false;
            }
            return true;
          });

          if (filtered.length === 0 && (country || region || language)) return null;
          memberCountsByClub[club.id] = filtered.length;
          return club.id;
        })
      );

      const validIds = new Set(filteredClubIds.filter(Boolean));
      result = result.filter(c => validIds.has(c.id));
    }

    return res.json(result);
  } catch (e) {
    console.error("[GET /motoclubs]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/featured", requireAuth, async (_req: Request, res: Response) => {
  try {
    const [club] = await db.select({
      club: motoClubs,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
    })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true))
      .orderBy(desc(motoClubs.activityScore))
      .limit(1);

    return res.json(club ? { ...club.club, memberCount: club.memberCount } : null);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/invites", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const invites = await db.select({
      invite: motoClubInvites,
      club: motoClubs,
    })
      .from(motoClubInvites)
      .innerJoin(motoClubs, eq(motoClubs.id, motoClubInvites.clubId))
      .where(and(eq(motoClubInvites.userId, userId), eq(motoClubInvites.status, "pending")));

    return res.json(invites.map(r => ({ ...r.invite, club: r.club })));
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/marketplace", requireAuth, async (req: Request, res: Response) => {
  try {
    const { storage } = await import("../storage");
    const marketplaceSetting = await storage.getAppSetting("marketplace_enabled");
    if (marketplaceSetting?.value === "false") {
      return res.json([]);
    }

    const userId = req.session.userId!;

    const userClubs = await db.select({ clubId: motoClubMembers.clubId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));

    if (userClubs.length === 0) return res.json([]);

    const clubIds = userClubs.map(c => c.clubId);

    const allMembers = await db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(
        sql`${motoClubMembers.clubId} IN (${sql.join(clubIds.map(id => sql`${id}`), sql`, `)})`,
        eq(motoClubMembers.status, "active"),
        sql`${motoClubMembers.userId} != ${userId}`
      ));

    if (allMembers.length === 0) return res.json([]);

    const memberIds = [...new Set(allMembers.map(m => m.userId))];

    const motos = await db.select({
      moto: userMotorcycles,
      user: { id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl },
    })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(and(
        eq(userMotorcycles.isForSale, true),
        sql`${userMotorcycles.userId} IN (${sql.join(memberIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(desc(userMotorcycles.createdAt));

    const seen = new Set<string>();
    const result = motos
      .filter(r => {
        if (seen.has(r.moto.id)) return false;
        seen.add(r.moto.id);
        return true;
      })
      .map(r => ({
        id: r.moto.id,
        brand: r.moto.brand,
        model: r.moto.model,
        year: r.moto.year,
        displacement: r.moto.displacement,
        motorcycleType: r.moto.motorcycleType,
        photoUrl: r.moto.photoUrl,
        saleDescription: r.moto.saleDescription,
        seller: r.user,
      }));

    return res.json(result);
  } catch (e) {
    console.error("Marketplace error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/map", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.session.userId!;
    const clubs = await db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      logoUrl: motoClubs.logoUrl,
      region: motoClubs.region,
      country: motoClubs.country,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      memberCount: sql<number>`(select count(*) from moto_club_members m where m.club_id = moto_clubs.id and m.status = 'active')::int`,
      currentUserIsMember: sql<boolean>`exists(select 1 from moto_club_members m2 where m2.club_id = moto_clubs.id and m2.user_id = ${currentUserId} and m2.status = 'active')`,
    })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true));

    const result: Array<{
      id: string;
      name: string;
      clubType: string;
      logoUrl: string | null;
      region: string | null;
      country: string | null;
      latitude: number;
      longitude: number;
      isFictitious: boolean;
      memberCount: number;
      currentUserIsMember: boolean;
    }> = [];

    for (const c of clubs) {
      if (c.latitude != null && c.longitude != null) {
        result.push({
          id: c.id,
          name: c.name,
          clubType: c.clubType,
          logoUrl: c.logoUrl,
          region: c.region,
          country: c.country,
          latitude: c.latitude,
          longitude: c.longitude,
          isFictitious: false,
          memberCount: Number(c.memberCount),
          currentUserIsMember: Boolean(c.currentUserIsMember),
        });
      } else if (c.clubType === "region") {
        const center = getRegionCenter(c.region ?? "");
        if (center) {
          result.push({
            id: c.id,
            name: c.name,
            clubType: c.clubType,
            logoUrl: c.logoUrl,
            region: c.region,
            country: c.country,
            latitude: center.latitude,
            longitude: center.longitude,
            isFictitious: true,
            memberCount: Number(c.memberCount),
            currentUserIsMember: Boolean(c.currentUserIsMember),
          });
        }
      }
    }

    return res.json(result);
  } catch (e) {
    console.error("[GET /motoclubs/map]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/map/pending-locations", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "moderator" && user.role !== "moderatore")) {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }

    const clubs = await db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      logoUrl: motoClubs.logoUrl,
      region: motoClubs.region,
      proposedLatitude: motoClubs.proposedLatitude,
      proposedLongitude: motoClubs.proposedLongitude,
      proposedAddress: motoClubs.proposedAddress,
      proposedBy: motoClubs.proposedBy,
      proposedAt: motoClubs.proposedAt,
    })
      .from(motoClubs)
      .where(and(
        eq(motoClubs.isApproved, true),
        sql`${motoClubs.proposedLatitude} IS NOT NULL`,
      ))
      .orderBy(desc(motoClubs.updatedAt));

    const enriched = await allLimited(clubs.map((c) => async () => {
      let proposerNickname: string | null = null;
      if (c.proposedBy) {
        const proposer = await storage.getUser(c.proposedBy);
        proposerNickname = proposer?.nickname ?? null;
      }
      return { ...c, proposerNickname };
    }));

    return res.json(enriched);
  } catch (e) {
    console.error("[GET /motoclubs/map/pending-locations]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const userId = req.session.userId!;

    // Only active members may access the full club record (member list + internal fields).
    // Non-members must use GET /:id/public which returns a curated safe subset.
    // We also use an explicit field whitelist (no `{ ...club }` spread) so that admin/moderator-only
    // columns (proposedLatitude/Longitude/Address/By/At — see /map/pending-locations) are never
    // leaked through this member-facing endpoint, even if new privileged columns are added later.
    // SECURITY (Task #1081): proposedLatitude e' selezionata SOLO per derivare il
    // boolean `hasPendingLocationProposal` (la UI ha bisogno di sapere "se" ma
    // non "dove"). Il valore raw non viene mai serializzato in risposta.
    const [clubRow] = await db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      description: motoClubs.description,
      logoUrl: motoClubs.logoUrl,
      coverUrl: motoClubs.coverUrl,
      isApproved: motoClubs.isApproved,
      isFeatured: motoClubs.isFeatured,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      conversationId: motoClubs.conversationId,
      parentClubId: motoClubs.parentClubId,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      createdAt: motoClubs.createdAt,
      updatedAt: motoClubs.updatedAt,
      _proposedLatitude: motoClubs.proposedLatitude,
    }).from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!clubRow) return res.status(404).json({ message: "Club non trovato" });
    const { _proposedLatitude, ...club } = clubRow;
    const hasPendingLocationProposal = _proposedLatitude != null;

    const [membership] = await db.select({ id: motoClubMembers.id })
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, clubId),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active"),
      ))
      .limit(1);
    if (!membership) return res.status(403).json({ message: "Non sei membro di questo club" });

    const membersRaw = await db.select({
      member: motoClubMembers,
      user: users,
    })
      .from(motoClubMembers)
      .innerJoin(users, eq(users.id, motoClubMembers.userId))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)));

    const members = membersRaw.map(r => ({
      userId: r.user.id,
      nickname: r.user.nickname,
      userType: r.user.userType,
      avatarUrl: r.user.avatarUrl,
      country: r.user.country,
      joinedAt: r.member.joinedAt,
    }));

    return res.json({ ...club, hasPendingLocationProposal, members, memberCount: members.length });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/:id/marketplace", requireAuth, async (req: Request, res: Response) => {
  try {
    const { storage } = await import("../storage");
    const marketplaceSetting = await storage.getAppSetting("marketplace_enabled");
    if (marketplaceSetting?.value === "false") {
      return res.json([]);
    }

    const clubId = req.params.id;
    const userId = req.session.userId!;

    const [isMember] = await db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .limit(1);
    if (!isMember) return res.status(403).json({ message: "Devi essere membro del club" });

    const memberIds = await db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")));

    if (memberIds.length === 0) return res.json([]);

    const ids = memberIds.map(m => m.userId);
    const motos = await db.select({
      moto: userMotorcycles,
      user: { id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl },
    })
      .from(userMotorcycles)
      .innerJoin(users, eq(users.id, userMotorcycles.userId))
      .where(and(
        eq(userMotorcycles.isForSale, true),
        sql`${userMotorcycles.userId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(desc(userMotorcycles.createdAt));

    const result = motos.map(r => ({
      id: r.moto.id,
      brand: r.moto.brand,
      model: r.moto.model,
      year: r.moto.year,
      displacement: r.moto.displacement,
      motorcycleType: r.moto.motorcycleType,
      photoUrl: r.moto.photoUrl,
      saleDescription: r.moto.saleDescription,
      seller: r.user,
    }));

    return res.json(result);
  } catch (e) {
    console.error("Club marketplace error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/:id/public", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const [club] = await db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      logoUrl: motoClubs.logoUrl,
      isApproved: motoClubs.isApproved,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      createdAt: motoClubs.createdAt,
    }).from(motoClubs).where(and(eq(motoClubs.id, clubId), eq(motoClubs.isApproved, true))).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    return res.json(club);
  } catch (e) {
    console.error("Public club error:", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/:id/detail", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const userId = req.session.userId!;
    const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    // SECURITY (Task #1081): whitelist esplicita allineata a GET /:id. La
    // versione precedente faceva `db.select().from(motoClubs)` (intero record),
    // esponendo a qualsiasi membro attivo i campi di moderazione
    // (proposedLatitude/Longitude/Address/By/At) e identificatori interni
    // (createdBy). I dettagli della proposta restano disponibili SOLO su
    // /api/motoclubs/map/pending-locations (admin/moderator). La UI membro
    // riceve solo il boolean `hasPendingLocationProposal`.
    const [clubRow] = await db.select({
      id: motoClubs.id,
      name: motoClubs.name,
      clubType: motoClubs.clubType,
      brandName: motoClubs.brandName,
      modelName: motoClubs.modelName,
      region: motoClubs.region,
      country: motoClubs.country,
      description: motoClubs.description,
      logoUrl: motoClubs.logoUrl,
      coverUrl: motoClubs.coverUrl,
      isApproved: motoClubs.isApproved,
      isFeatured: motoClubs.isFeatured,
      memberCount: motoClubs.memberCount,
      activityScore: motoClubs.activityScore,
      conversationId: motoClubs.conversationId,
      parentClubId: motoClubs.parentClubId,
      latitude: motoClubs.latitude,
      longitude: motoClubs.longitude,
      createdAt: motoClubs.createdAt,
      updatedAt: motoClubs.updatedAt,
      _proposedLatitude: motoClubs.proposedLatitude,
    }).from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!clubRow) return res.status(404).json({ message: "Club non trovato" });
    const { _proposedLatitude, ...club } = clubRow;
    const hasPendingLocationProposal = _proposedLatitude != null;

    const [membership] = await db.select({ id: motoClubMembers.id })
      .from(motoClubMembers)
      .where(and(
        eq(motoClubMembers.clubId, clubId),
        eq(motoClubMembers.userId, userId),
        eq(motoClubMembers.status, "active"),
      ))
      .limit(1);
    if (!membership) return res.status(403).json({ message: "Non sei membro di questo club" });

    const memberships = await db
      .select({
        profileId: motoClubMembers.userId,
        role: motoClubMembers.role,
        joinedAt: motoClubMembers.joinedAt,
        nickname: users.nickname,
        userType: users.userType,
        avatarUrl: users.avatarUrl,
        country: users.country,
      })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)))
      .orderBy(motoClubMembers.joinedAt)
      .limit(limit)
      .offset(offset);

    const [{ totalCount }] = await db
      .select({ totalCount: count(motoClubMembers.id) })
      .from(motoClubMembers)
      .innerJoin(users, eq(motoClubMembers.userId, users.id))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active"), ...systemAccountConditions(users)));

    const total = Number(totalCount);
    return res.json({ ...club, hasPendingLocationProposal, members: memberships, totalCount: total, hasMore: offset + limit < total });
  } catch (e) {
    console.error("[GET /:id/detail]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/:id/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const members = await db.select({ userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")));

    if (members.length === 0) return res.json({ totalKm: 0, totalRides: 0, memberCount: 0 });

    const memberIds = members.map(m => m.userId);

    const stats = await db.select({
      totalKm: sql<number>`coalesce(sum(total_distance_km), 0)::float`,
      totalRides: sql<number>`count(*)::int`,
    })
      .from(routes)
      .where(sql`user_id = ANY(${memberIds}) AND status = 'completed'`);

    return res.json({
      totalKm: Math.round((stats[0]?.totalKm ?? 0) * 10) / 10,
      totalRides: stats[0]?.totalRides ?? 0,
      memberCount: members.length,
    });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/:id/join", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;

    const [club] = await db.select().from(motoClubs).where(and(eq(motoClubs.id, clubId), eq(motoClubs.isApproved, true))).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const existing = await db.select().from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId)))
      .limit(1);

    if (existing.length > 0 && existing[0].status === "active") {
      return res.status(409).json({ message: "Sei già membro di questo club" });
    }

    if (existing.length > 0) {
      await db.update(motoClubMembers)
        .set({ status: "active", joinedAt: new Date() })
        .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId)));
    } else {
      await db.insert(motoClubMembers).values({ clubId, userId, status: "active" });
    }

    await db.update(motoClubInvites)
      .set({ status: "accepted" })
      .where(and(eq(motoClubInvites.clubId, clubId), eq(motoClubInvites.userId, userId)));

    let convId = club.conversationId;
    const conversationWasNew = !convId;
    if (!convId) {
      convId = await createClubConversation(clubId, club.name);
    }
    if (convId) {
      await addMemberToConversation(convId, userId);
      if (conversationWasNew) {
        const existingMembers = await db
          .select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")));
        const participantRows = existingMembers
          .filter((m) => m.userId !== userId)
          .map((m) => ({ conversationId: convId as string, userId: m.userId }));
        if (participantRows.length > 0) {
          await db.insert(conversationParticipants).values(participantRows).onConflictDoNothing();
        }
      }
    }

    await db.update(motoClubs)
      .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
      .where(eq(motoClubs.id, clubId));

    await notifyTopMembersOfNewJoin(clubId, userId, club.name);

    return res.json({ message: "Sei entrato nel club" });
  } catch (e) {
    console.error("[POST /motoclubs/:id/join]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/:id/leave", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;

    await db.update(motoClubMembers)
      .set({ status: "left" })
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId)));

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (club?.conversationId) {
      await removeMemberFromConversation(club.conversationId, userId);
    }

    return res.json({ message: "Hai lasciato il club" });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.put("/invites/:id/respond", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const inviteId = req.params.id;
    const { response } = req.body as { response: "accepted" | "declined" };

    if (!["accepted", "declined"].includes(response)) {
      return res.status(400).json({ message: "Risposta non valida" });
    }

    const [invite] = await db.select().from(motoClubInvites)
      .where(and(eq(motoClubInvites.id, inviteId), eq(motoClubInvites.userId, userId)))
      .limit(1);

    if (!invite) return res.status(404).json({ message: "Invito non trovato" });

    await db.update(motoClubInvites)
      .set({ status: response })
      .where(eq(motoClubInvites.id, inviteId));

    if (response === "accepted") {
      const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, invite.clubId)).limit(1);
      if (club) {
        const existing = await db.select().from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, invite.clubId), eq(motoClubMembers.userId, userId)))
          .limit(1);

        if (existing.length > 0) {
          await db.update(motoClubMembers)
            .set({ status: "active", joinedAt: new Date() })
            .where(and(eq(motoClubMembers.clubId, invite.clubId), eq(motoClubMembers.userId, userId)));
        } else {
          await db.insert(motoClubMembers).values({ clubId: invite.clubId, userId, status: "active" });
        }

        let convId = club.conversationId;
        if (!convId) convId = await createClubConversation(invite.clubId, club.name);
        if (convId) await addMemberToConversation(convId, userId);

        await db.update(motoClubs)
          .set({ activityScore: sql`activity_score + 2`, updatedAt: new Date() })
          .where(eq(motoClubs.id, invite.clubId));

        await notifyTopMembersOfNewJoin(invite.clubId, userId, club.name);
      }
    }

    return res.json({ message: response === "accepted" ? "Sei entrato nel club!" : "Invito rifiutato" });
  } catch (e) {
    console.error("[PUT /invites/:id/respond]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/request", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { name, clubType, brandName, modelName } = req.body;

    if (!name || !clubType) return res.status(400).json({ message: "Nome e tipo obbligatori" });
    if (!["brand", "model"].includes(clubType)) return res.status(400).json({ message: "Tipo non valido" });
    if (clubType === "model" && (!brandName || !modelName)) {
      return res.status(400).json({ message: "Marca e modello richiesti per club By Model" });
    }

    const [request] = await db.insert(motoClubRequests).values({
      name,
      clubType,
      brandName: brandName || null,
      modelName: modelName || null,
      requestedBy: userId,
      status: "pending",
    }).returning();

    return res.status(201).json(request);
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/me/clubs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubs = await db.select({
      club: motoClubs,
      member: motoClubMembers,
    })
      .from(motoClubMembers)
      .innerJoin(motoClubs, eq(motoClubs.id, motoClubMembers.clubId))
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));

    return res.json(clubs.map(r => ({ ...r.club, joinedAt: r.member.joinedAt, role: r.member.role })));
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/creation-request", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const creationEnabled = await storage.getAppSetting("motoclub_user_creation_enabled");
    if (creationEnabled?.value !== "true") {
      return res.status(403).json({ message: "Creazione motoclub non abilitata" });
    }

    const { name, parentClubId, latitude, longitude, inviteRadiusKm, inviteUserIds } = req.body as {
      name: string;
      parentClubId?: string;
      latitude?: number;
      longitude?: number;
      inviteRadiusKm?: number;
      inviteUserIds?: string[];
    };

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Nome obbligatorio (min 2 caratteri)" });
    }

    const user = await storage.getUser(userId);

    const [request] = await db.insert(motoClubRequests).values({
      name: name.trim(),
      clubType: "custom",
      requestedBy: userId,
      status: "pending",
      parentClubId: parentClubId ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      inviteRadiusKm: inviteRadiusKm ?? null,
      inviteUserIds: inviteUserIds && inviteUserIds.length > 0 ? JSON.stringify(inviteUserIds) : null,
    }).returning();

    await db.insert(feedbackTickets).values({
      userId,
      ticketType: "suggestion",
      subject: `Richiesta creazione Motoclub: ${name}`,
      message: [
        `Utente: ${user?.nickname ?? userId}`,
        `Nome club: ${name}`,
        parentClubId ? `Sub-club di: ${parentClubId}` : "Elenco principale",
        latitude && longitude ? `Posizione: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : "Nessuna posizione",
        inviteRadiusKm ? `Raggio inviti: ${inviteRadiusKm} km` : "",
        inviteUserIds && inviteUserIds.length > 0 ? `Utenti invitati: ${inviteUserIds.length}` : "",
        `Request ID: ${request.id}`,
      ].filter(Boolean).join("\n"),
      status: "open",
    });

    const adminEmail = process.env.ADMIN_EMAIL || "bikerlinkapp@gmail.com";
    await sendEmail(
      adminEmail,
      `[BikerLink] Nuova richiesta Motoclub: ${name}`,
      `<p>Un utente ha richiesto la creazione di un nuovo motoclub:</p>
      <ul>
        <li><strong>Utente:</strong> ${user?.nickname ?? userId}</li>
        <li><strong>Nome:</strong> ${name}</li>
        <li><strong>Tipo:</strong> ${parentClubId ? "Sub-club" : "Elenco principale"}</li>
        ${latitude && longitude ? `<li><strong>Posizione:</strong> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</li>` : ""}
        ${inviteRadiusKm ? `<li><strong>Raggio inviti:</strong> ${inviteRadiusKm} km</li>` : ""}
        ${inviteUserIds && inviteUserIds.length > 0 ? `<li><strong>Inviti manuali:</strong> ${inviteUserIds.length} utenti</li>` : ""}
        <li><strong>Request ID:</strong> ${request.id}</li>
      </ul>
      <p>Vai al pannello admin per approvare o rifiutare.</p>`
    ).catch(e => console.error("[creation-request] email error:", e));

    return res.status(201).json({ success: true, requestId: request.id });
  } catch (e) {
    console.error("[POST /creation-request]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.get("/creation-request/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [request] = await db
      .select()
      .from(motoClubRequests)
      .where(and(eq(motoClubRequests.requestedBy, userId), eq(motoClubRequests.clubType, "custom")))
      .orderBy(desc(motoClubRequests.createdAt))
      .limit(1);

    if (!request) return res.json(null);
    return res.json({
      status: request.status,
      name: request.name,
      createdAt: request.createdAt,
      reviewNote: request.reviewNote,
    });
  } catch (e) {
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/:id/propose-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const { latitude, longitude, address } = req.body as { latitude?: number; longitude?: number; address?: string };

    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: "Latitudine e longitudine obbligatorie" });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: "Latitudine non valida" });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: "Longitudine non valida" });
    }

    const [club] = await db.select().from(motoClubs).where(and(eq(motoClubs.id, clubId), eq(motoClubs.isApproved, true))).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const [membership] = await db.select()
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")))
      .limit(1);
    if (!membership) return res.status(403).json({ message: "Devi essere membro del club per proporre una sede" });

    await db.update(motoClubs).set({
      proposedLatitude: latitude,
      proposedLongitude: longitude,
      proposedAddress: address ? address.trim() || null : null,
      proposedBy: userId,
      proposedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId));

    await storage.createNotification({
      userId,
      title: "Proposta sede inviata",
      body: `La tua proposta di sede per "${club.name}" è in attesa di approvazione`,
      notificationType: "motoclub_invite",
      referenceType: "motoclub",
      referenceId: clubId,
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /motoclubs/:id/propose-location]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/:id/approve-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const adminUser = await storage.getUser(userId);
    if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "moderator" && adminUser.role !== "moderatore")) {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });
    if (club.proposedLatitude == null) return res.status(400).json({ message: "Nessuna proposta in attesa" });

    await db.update(motoClubs).set({
      latitude: club.proposedLatitude,
      longitude: club.proposedLongitude,
      proposedLatitude: null,
      proposedLongitude: null,
      proposedAddress: null,
      proposedBy: null,
      proposedAt: null,
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId));

    if (club.proposedBy) {
      await storage.createNotification({
        userId: club.proposedBy,
        title: "Sede approvata!",
        body: `La sede proposta per "${club.name}" è stata approvata`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: clubId,
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /motoclubs/:id/approve-location]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/:id/reject-location", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const clubId = req.params.id;
    const adminUser = await storage.getUser(userId);
    if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "moderator" && adminUser.role !== "moderatore")) {
      return res.status(403).json({ message: "Accesso non autorizzato" });
    }

    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const proposedByUserId = club.proposedBy;

    await db.update(motoClubs).set({
      proposedLatitude: null,
      proposedLongitude: null,
      proposedAddress: null,
      proposedBy: null,
      proposedAt: null,
      updatedAt: new Date(),
    }).where(eq(motoClubs.id, clubId));

    if (proposedByUserId) {
      await storage.createNotification({
        userId: proposedByUserId,
        title: "Proposta sede rifiutata",
        body: `La sede proposta per "${club.name}" non è stata approvata`,
        notificationType: "motoclub_invite",
        referenceType: "motoclub",
        referenceId: clubId,
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /motoclubs/:id/reject-location]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

router.post("/sync-garage", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "Utente non trovato" });

    const before = await db.select({ c: count() })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const countBefore = Number(before[0]?.c ?? 0);

    if (user.userType === "zavorrina") {
      // Zavorrina: usa le moto della wishlist
      const wishlist = await storage.getWishlist(userId);
      if (wishlist) {
        const wishlistMotos = await storage.getWishlistMotos(wishlist.id);
        for (const moto of wishlistMotos) {
          if (moto.brand) {
            await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
          }
        }
      }
    } else {
      // Biker / coppia: usa le moto del garage
      const motos = await storage.getUserMotorcycles(userId);
      for (const moto of motos) {
        await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
      }
    }

    if (user.region) {
      await createRegionalClubInvite(userId, user.region);
    }

    const after = await db.select({ c: count() })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const countAfter = Number(after[0]?.c ?? 0);

    const joined = countAfter - countBefore;
    return res.json({
      joined,
      message: joined > 0 ? `Iscritto a ${joined} club!` : "Nessun nuovo club trovato",
    });
  } catch (e) {
    console.error("[POST /sync-garage]", e);
    return res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
