/**
 * Script: reconcile-user-clubs.ts
 *
 * Riconcilia gli inviti ai motoclub per un utente specifico,
 * basandosi sulle moto presenti nel suo garage.
 *
 * Equivalente all'endpoint POST /api/admin/reconcile-club-invites
 * ma eseguibile direttamente da CLI senza sessione HTTP admin.
 *
 * Usage:
 *   npx tsx scripts/reconcile-user-clubs.ts <userId>
 *   npx tsx scripts/reconcile-user-clubs.ts --email <email>
 *   npx tsx scripts/reconcile-user-clubs.ts --nickname <nickname>
 */

import { db } from "../server/db";
import { createClubInvitesForMoto } from "../server/routes/motoclubs";
import { motoClubInvites, userMotorcycles, users } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function reconcileUserClubs(userId: string): Promise<void> {
  const motos = await db
    .select()
    .from(userMotorcycles)
    .where(eq(userMotorcycles.userId, userId));

  if (motos.length === 0) {
    console.log(`[reconcile] Nessuna moto trovata per userId: ${userId}`);
    return;
  }

  console.log(`[reconcile] ${motos.length} moto trovate per userId: ${userId}`);
  console.log(motos.map((m) => `  - ${m.brand} ${m.model}`).join("\n"));

  for (const moto of motos) {
    console.log(`[reconcile] Creando inviti per: ${moto.brand} ${moto.model}`);
    await createClubInvitesForMoto(userId, moto.brand, moto.model);
  }

  const invites = await db
    .select()
    .from(motoClubInvites)
    .where(eq(motoClubInvites.userId, userId));

  console.log(`[reconcile] Inviti totali per l'utente: ${invites.length}`);
  console.log(`[reconcile] Riconciliazione completata.`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/reconcile-user-clubs.ts <userId>");
    console.error("       npx tsx scripts/reconcile-user-clubs.ts --email <email>");
    console.error("       npx tsx scripts/reconcile-user-clubs.ts --nickname <nickname>");
    process.exit(1);
  }

  let userId: string;

  if (args[0] === "--email" && args[1]) {
    const [user] = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${args[1]})`)
      .limit(1);
    if (!user) {
      console.error(`Utente non trovato con email: ${args[1]}`);
      process.exit(1);
    }
    userId = user.id;
    console.log(`[reconcile] Utente trovato: ${user.nickname} (${user.id})`);
  } else if (args[0] === "--nickname" && args[1]) {
    const [user] = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(sql`LOWER(${users.nickname}) = LOWER(${args[1]})`)
      .limit(1);
    if (!user) {
      console.error(`Utente non trovato con nickname: ${args[1]}`);
      process.exit(1);
    }
    userId = user.id;
    console.log(`[reconcile] Utente trovato: ${user.nickname} (${user.id})`);
  } else {
    userId = args[0];
  }

  await reconcileUserClubs(userId);
  process.exit(0);
}

main().catch((e) => {
  console.error("[reconcile] Errore:", e);
  process.exit(1);
});
