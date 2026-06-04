import { db } from "../../db";
import { motoClubs, conversations, motoClubMembers, conversationParticipants, users } from "@shared/db";
import { eq, and, ilike, sql, isNull, inArray } from "drizzle-orm";

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

async function ensureClubConversation(clubId: string, clubName: string): Promise<string | null> {
  try {
    const [conv] = await db.insert(conversations).values({
      conversationType: "motoclub",
      title: `Club ${clubName}`,
    }).returning();
    await db.update(motoClubs)
      .set({ conversationId: conv.id, updatedAt: new Date() })
      .where(eq(motoClubs.id, clubId));
    return conv.id;
  } catch (e) {
    console.error("[Motoclub] ensureClubConversation error for", clubName, e);
    return null;
  }
}

export async function seedMotoclubs() {
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
        const [inserted] = await db.insert(motoClubs).values({
          name: b.name,
          clubType: "brand",
          brandName: b.brandName,
          logoUrl: b.logoUrl ?? null,
          isApproved: true,
          activityScore: 0,
        }).returning({ id: motoClubs.id });
        if (inserted?.id) {
          await ensureClubConversation(inserted.id, b.name);
        }
      }
      console.log("[Motoclub] Seed brand:", SEED_BRANDS.length, "club");
    } else {
      let repaired = 0;
      for (const b of SEED_BRANDS) {
        const existing = await db.select({ id: motoClubs.id })
          .from(motoClubs)
          .where(and(eq(motoClubs.clubType, "brand"), ilike(motoClubs.brandName!, b.brandName)))
          .limit(1);
        if (existing.length === 0) {
          const [inserted] = await db.insert(motoClubs).values({
            name: b.name,
            clubType: "brand",
            brandName: b.brandName,
            logoUrl: b.logoUrl ?? null,
            isApproved: true,
            activityScore: 0,
          }).returning({ id: motoClubs.id });
          if (inserted?.id) {
            await ensureClubConversation(inserted.id, b.name);
          }
          repaired++;
          console.log("[Motoclub] Repair: aggiunto club brand mancante:", b.name);
        }
      }
      if (repaired > 0) console.log("[Motoclub] Repair brand completato:", repaired, "club aggiunti");
    }

    if (Number(regionCount) === 0) {
      for (const r of SEED_REGIONS) {
        const [inserted] = await db.insert(motoClubs).values({
          name: `Motoclub ${r.region}`,
          clubType: "region",
          region: r.region,
          country: "IT",
          logoUrl: r.logoUrl,
          isApproved: true,
          activityScore: 0,
        }).returning({ id: motoClubs.id });
        if (inserted?.id) {
          await ensureClubConversation(inserted.id, `Motoclub ${r.region}`);
        }
      }
      console.log("[Motoclub] Seed regionali:", SEED_REGIONS.length, "club");
    } else {
      let repaired = 0;
      for (const r of SEED_REGIONS) {
        const existing = await db.select({ id: motoClubs.id })
          .from(motoClubs)
          .where(and(eq(motoClubs.clubType, "region"), ilike(motoClubs.region!, r.region)))
          .limit(1);
        if (existing.length === 0) {
          const [inserted] = await db.insert(motoClubs).values({
            name: `Motoclub ${r.region}`,
            clubType: "region",
            region: r.region,
            country: "IT",
            logoUrl: r.logoUrl,
            isApproved: true,
            activityScore: 0,
          }).returning({ id: motoClubs.id });
          if (inserted?.id) {
            await ensureClubConversation(inserted.id, `Motoclub ${r.region}`);
          }
          repaired++;
          console.log("[Motoclub] Repair: aggiunto club regionale mancante:", r.region);
        }
      }
      if (repaired > 0) console.log("[Motoclub] Repair regionali completato:", repaired, "club aggiunti");
    }

    // Repair: clubs that already existed but have no conversationId
    await repairMissingConversations();
  } catch (e) {
    console.error("[Motoclub seed error]", e);
  }
}

async function repairMissingConversations() {
  try {
    const clubsWithoutConv = await db
      .select({ id: motoClubs.id, name: motoClubs.name })
      .from(motoClubs)
      .where(and(eq(motoClubs.isApproved, true), isNull(motoClubs.conversationId)));

    if (clubsWithoutConv.length === 0) return;

    let repaired = 0;
    for (const club of clubsWithoutConv) {
      const created = await ensureClubConversation(club.id, club.name);
      if (created) repaired++;
    }
    if (repaired > 0) console.log("[Motoclub] Repair conversations:", repaired, "club aggiornati");
  } catch (e) {
    console.error("[Motoclub] repairMissingConversations error:", e);
  }
}

export async function seedClubMembershipsOnBoot(): Promise<void> {
  try {
    const approvedBrandClubs = await db
      .select({ id: motoClubs.id, conversationId: motoClubs.conversationId })
      .from(motoClubs)
      .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "brand")));

    const approvedRegionalClubs = await db
      .select({ id: motoClubs.id, conversationId: motoClubs.conversationId, region: motoClubs.region })
      .from(motoClubs)
      .where(and(eq(motoClubs.isApproved, true), eq(motoClubs.clubType, "region")));

    if (approvedBrandClubs.length === 0 && approvedRegionalClubs.length === 0) return;

    const regionalByRegion = new Map(approvedRegionalClubs.map(c => [c.region, c]));

    const fakeUsers = await db
      .select({ id: users.id, region: users.region, country: users.country })
      .from(users)
      .where(eq(users.isFake, true));

    if (fakeUsers.length === 0) {
      console.log("[Motoclub] seedClubMembershipsOnBoot: nessun utente fake, skip");
      return;
    }

    const fakeUserIds = fakeUsers.map(u => u.id);

    const profileByUserId = new Map(fakeUsers.map(u => [u.id, u]));

    const existingMemberships = await db
      .select({ clubId: motoClubMembers.clubId, userId: motoClubMembers.userId })
      .from(motoClubMembers)
      .where(inArray(motoClubMembers.userId, fakeUserIds));

    const membershipSet = new Set(existingMemberships.map(m => `${m.clubId}:${m.userId}`));

    const clubMemberRows: { clubId: string; userId: string; role: string; status: string }[] = [];
    const convParticipantRows: { conversationId: string; userId: string }[] = [];

    for (const user of fakeUsers) {
      if (approvedBrandClubs.length > 0) {
        const count = 1 + Math.floor(Math.random() * 2);
        const shuffled = [...approvedBrandClubs].sort(() => Math.random() - 0.5).slice(0, count);
        for (const club of shuffled) {
          const key = `${club.id}:${user.id}`;
          if (!membershipSet.has(key)) {
            membershipSet.add(key);
            clubMemberRows.push({ clubId: club.id, userId: user.id, role: "member", status: "active" });
            if (club.conversationId) {
              convParticipantRows.push({ conversationId: club.conversationId, userId: user.id });
            }
          }
        }
      }

      const profile = profileByUserId.get(user.id);
      if (profile?.region && profile.country === "IT") {
        const regionalClub = regionalByRegion.get(profile.region);
        if (regionalClub) {
          const key = `${regionalClub.id}:${user.id}`;
          if (!membershipSet.has(key)) {
            membershipSet.add(key);
            clubMemberRows.push({ clubId: regionalClub.id, userId: user.id, role: "member", status: "active" });
            if (regionalClub.conversationId) {
              convParticipantRows.push({ conversationId: regionalClub.conversationId, userId: user.id });
            }
          }
        }
      }
    }

    if (clubMemberRows.length > 0) {
      await db.insert(motoClubMembers).values(clubMemberRows).onConflictDoNothing();
    }
    if (convParticipantRows.length > 0) {
      await db.insert(conversationParticipants).values(convParticipantRows).onConflictDoNothing();
    }

    console.log(`[Motoclub] seedClubMembershipsOnBoot: ${clubMemberRows.length} iscrizioni, ${convParticipantRows.length} partecipanti chat`);
  } catch (e) {
    console.error("[Motoclub] seedClubMembershipsOnBoot error:", e);
  }
}
