import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  motoClubs,
  motoClubMembers,
  motoClubInvites,
  motoClubRequests,
  conversations,
  conversationParticipants,
  messages,
  routes,
  users,
  userProfiles,
  userMotorcycles,
} from "@shared/schema";
import { eq, and, ilike, or, sql, desc, ne } from "drizzle-orm";

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

const SEED_MODELS = [
  { name: "BMW R 1250 GS", brandName: "BMW", modelName: "R 1250 GS" },
  { name: "BMW R 1200 GS", brandName: "BMW", modelName: "R 1200 GS" },
  { name: "BMW S 1000 RR", brandName: "BMW", modelName: "S 1000 RR" },
  { name: "Ducati Panigale V4", brandName: "Ducati", modelName: "Panigale V4" },
  { name: "Ducati Monster", brandName: "Ducati", modelName: "Monster" },
  { name: "Ducati Multistrada", brandName: "Ducati", modelName: "Multistrada" },
  { name: "Ducati Scrambler", brandName: "Ducati", modelName: "Scrambler" },
  { name: "Harley-Davidson Sportster", brandName: "Harley-Davidson", modelName: "Sportster" },
  { name: "Harley-Davidson Road King", brandName: "Harley-Davidson", modelName: "Road King" },
  { name: "Harley-Davidson Fat Boy", brandName: "Harley-Davidson", modelName: "Fat Boy" },
  { name: "Honda Africa Twin", brandName: "Honda", modelName: "Africa Twin" },
  { name: "Honda CB1000R", brandName: "Honda", modelName: "CB1000R" },
  { name: "Yamaha MT-09", brandName: "Yamaha", modelName: "MT-09" },
  { name: "Yamaha Ténéré 700", brandName: "Yamaha", modelName: "Ténéré 700" },
  { name: "Kawasaki Z900", brandName: "Kawasaki", modelName: "Z900" },
  { name: "Kawasaki Ninja ZX-10R", brandName: "Kawasaki", modelName: "Ninja ZX-10R" },
  { name: "KTM 1290 Super Adventure", brandName: "KTM", modelName: "1290 Super Adventure" },
  { name: "KTM Duke 390", brandName: "KTM", modelName: "Duke 390" },
  { name: "Triumph Bonneville", brandName: "Triumph", modelName: "Bonneville" },
  { name: "Triumph Tiger 900", brandName: "Triumph", modelName: "Tiger 900" },
  { name: "Aprilia RSV4", brandName: "Aprilia", modelName: "RSV4" },
  { name: "Aprilia Tuono", brandName: "Aprilia", modelName: "Tuono" },
  { name: "Moto Guzzi V7", brandName: "Moto Guzzi", modelName: "V7" },
  { name: "MV Agusta Brutale", brandName: "MV Agusta", modelName: "Brutale" },
];

async function seedMotoclubs() {
  try {
    const existing = await db.select({ id: motoClubs.id }).from(motoClubs).limit(1);
    if (existing.length > 0) return;

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
    for (const m of SEED_MODELS) {
      await db.insert(motoClubs).values({
        name: m.name,
        clubType: "model",
        brandName: m.brandName,
        modelName: m.modelName,
        isApproved: true,
        activityScore: 0,
      });
    }
    console.log("[Motoclub] Seed completato:", SEED_BRANDS.length, "brand,", SEED_MODELS.length, "modelli");
  } catch (e) {
    console.error("[Motoclub seed error]", e);
  }
}

seedMotoclubs();

export async function createClubInvitesForMoto(userId: string, brand: string, model: string) {
  try {
    const user = await storage.getUser(userId);
    if (!user || user.autoJoinClubs === false) return;

    const matchingClubs = await db.select()
      .from(motoClubs)
      .where(
        and(
          eq(motoClubs.isApproved, true),
          or(
            and(eq(motoClubs.clubType, "brand"), ilike(motoClubs.brandName, brand)),
            and(eq(motoClubs.clubType, "model"), ilike(motoClubs.brandName, brand), ilike(motoClubs.modelName, model))
          )
        )
      );

    for (const club of matchingClubs) {
      const existing = await db.select()
        .from(motoClubInvites)
        .where(and(eq(motoClubInvites.clubId, club.id), eq(motoClubInvites.userId, userId)))
        .limit(1);

      if (existing.length > 0) continue;

      const isMember = await db.select()
        .from(motoClubMembers)
        .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.userId, userId)))
        .limit(1);

      if (isMember.length > 0) continue;

      await db.insert(motoClubInvites).values({
        clubId: club.id,
        userId,
        status: "pending",
      });

      await storage.createNotification({
        userId,
        title: "Ehi! Motoclub",
        body: `Ci sono altre persone con una ${brand}! Entra nel club "${club.name}"`,
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
      .orderBy(desc(motoClubs.activityScore), motoClubs.name);

    let result = clubs.map(r => ({ ...r.club, memberCount: r.memberCount }));

    if (country || region || language) {
      const memberCountsByClub: Record<string, number> = {};

      const filteredClubIds = await Promise.all(
        result.map(async (club) => {
          const memberQuery = db.select({ u: users })
            .from(motoClubMembers)
            .innerJoin(users, eq(users.id, motoClubMembers.userId))
            .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.status, "active")));

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

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.id;
    const [club] = await db.select().from(motoClubs).where(eq(motoClubs.id, clubId)).limit(1);
    if (!club) return res.status(404).json({ message: "Club non trovato" });

    const membersRaw = await db.select({
      member: motoClubMembers,
      user: users,
      profile: userProfiles,
    })
      .from(motoClubMembers)
      .innerJoin(users, eq(users.id, motoClubMembers.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, motoClubMembers.userId))
      .where(and(eq(motoClubMembers.clubId, clubId), eq(motoClubMembers.status, "active")));

    const members = membersRaw.map(r => ({
      userId: r.user.id,
      nickname: r.user.nickname,
      userType: r.user.userType,
      avatarUrl: r.user.avatarUrl,
      country: r.user.country,
      joinedAt: r.member.joinedAt,
    }));

    return res.json({ ...club, members, memberCount: members.length });
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
    if (!convId) {
      convId = await createClubConversation(clubId, club.name);
    }
    if (convId) await addMemberToConversation(convId, userId);

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

export default router;
