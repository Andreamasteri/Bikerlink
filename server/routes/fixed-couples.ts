import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { fixedCouples, notifications, users } from "@shared/db";
import { requireAuth } from "../lib/auth-middleware";
import { PROTECTED_NICKNAMES } from "../constants";

const router = Router();
const requestSchema = z.object({ email: z.string().trim().email().max(254) });
const visibleUser = and(eq(users.status, "active"), eq(users.isFake, false), eq(users.isSystem, false));

function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType };
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const rows = await db.select().from(fixedCouples).where(or(eq(fixedCouples.bikerId, userId), eq(fixedCouples.zavorrinaId, userId))).orderBy(desc(fixedCouples.createdAt));
  const ids = Array.from(new Set(rows.flatMap((row) => [row.bikerId, row.zavorrinaId])));
  const people = ids.length ? await db.select().from(users).where(and(inArray(users.id, ids), visibleUser)) : [];
  const byId = new Map(people.map((person) => [person.id, publicUser(person)]));
  const decorate = (row: typeof rows[number]) => ({ ...row, partner: byId.get(row.bikerId === userId ? row.zavorrinaId : row.bikerId) ?? null });
  return res.json({
    active: rows.filter((row) => row.status === "active").map(decorate),
    incomingPending: rows.filter((row) => row.status === "pending" && row.requestedBy !== userId).map(decorate),
    outgoingPending: rows.filter((row) => row.status === "pending" && row.requestedBy === userId).map(decorate),
  });
});

router.post("/request", async (req, res) => {
  const userId = req.session.userId!;
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Inserisci un indirizzo email valido" });
  const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [target] = await db.select().from(users).where(sql`LOWER(${users.email}) = ${parsed.data.email.toLowerCase()}`).limit(1);
  if (!sender || !target || target.id === sender.id || target.status !== "active" || target.isFake || target.isSystem || target.role === "admin" || PROTECTED_NICKNAMES.includes(target.nickname)) return res.status(404).json({ message: "Account non disponibile" });
  const senderType = sender.userType === "coppia" ? "biker" : sender.userType;
  const targetType = target.userType === "coppia" ? "biker" : target.userType;
  if (!((senderType === "biker" && targetType === "zavorrina") || (senderType === "zavorrina" && targetType === "biker"))) return res.status(400).json({ message: "La coppia fissa collega un biker e una zavorrina" });
  const bikerId = senderType === "biker" ? sender.id : target.id;
  const zavorrinaId = senderType === "zavorrina" ? sender.id : target.id;
  const [existing] = await db.select().from(fixedCouples).where(and(eq(fixedCouples.bikerId, bikerId), eq(fixedCouples.zavorrinaId, zavorrinaId), inArray(fixedCouples.status, ["pending", "active"]))).limit(1);
  if (existing) return res.status(409).json({ message: existing.status === "active" ? "Siete già una coppia fissa" : "Esiste già una richiesta in sospeso" });
  const [relation] = await db.insert(fixedCouples).values({ bikerId, zavorrinaId, requestedBy: userId, status: "pending" }).returning();
  await db.insert(notifications).values({ userId: target.id, title: "Richiesta di coppia fissa", body: `${sender.nickname} ti propone di indicare una coppia fissa.`, notificationType: "fixed_couple_request", referenceType: "fixed_couple", referenceId: relation.id });
  return res.status(201).json({ relation });
});

async function respond(req: any, res: any, status: "active" | "rejected") {
  const userId = req.session.userId!;
  const [relation] = await db.select().from(fixedCouples).where(and(eq(fixedCouples.id, String(req.params.id)), eq(fixedCouples.status, "pending"))).limit(1);
  if (!relation) return res.status(404).json({ message: "Richiesta non trovata o già gestita" });
  const recipientId = relation.requestedBy === relation.bikerId ? relation.zavorrinaId : relation.bikerId;
  if (recipientId !== userId) return res.status(403).json({ message: "Non autorizzato" });
  const [updated] = await db.update(fixedCouples).set({ status, respondedAt: new Date(), updatedAt: new Date() }).where(and(eq(fixedCouples.id, relation.id), eq(fixedCouples.status, "pending"))).returning();
  const [requester] = await db.select().from(users).where(eq(users.id, relation.requestedBy)).limit(1);
  if (requester) await db.insert(notifications).values({ userId: requester.id, title: status === "active" ? "Coppia fissa accettata" : "Richiesta rifiutata", body: status === "active" ? "La relazione di coppia fissa è attiva." : "La richiesta di coppia fissa è stata rifiutata.", notificationType: status === "active" ? "fixed_couple_accepted" : "fixed_couple_rejected", referenceType: "fixed_couple", referenceId: relation.id });
  return res.json({ relation: updated });
}
router.post("/:id/accept", (req, res) => respond(req, res, "active"));
router.post("/:id/reject", (req, res) => respond(req, res, "rejected"));

export default router;