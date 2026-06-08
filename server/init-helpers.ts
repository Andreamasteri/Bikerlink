import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { 
  motoClubs, 
  motoClubMembers, 
  conversations, 
  conversationParticipants 
} from "@shared/db";
import { existsSync } from "fs";
import { resolve } from "path";
import { execFile } from "child_process";

export function ensureCompetitorAnalysisPdf(): void {
  setImmediate(() => {
    const pdfPath = resolve(process.cwd(), "server/public/assets/competitor-analysis.pdf");
    const pngPath = resolve(process.cwd(), "server/public/assets/competitor-analysis.png");
    if (!existsSync(pdfPath) || !existsSync(pngPath)) {
      console.log("[INIT][BG] competitor-analysis.pdf/png mancante — avvio generazione...");
      const scriptPath = resolve(process.cwd(), "scripts/generate-competitor-analysis.js");
      execFile(process.execPath, [scriptPath], { timeout: 60_000 }, (err, stdout, stderr) => {
        if (err) {
          console.warn("[INIT][BG] generate-competitor-analysis: ERRORE —", err.message);
          if (stderr) console.warn("[INIT][BG] generate-competitor-analysis stderr:", stderr.slice(0, 300));
        } else {
          console.log("[INIT][BG] generate-competitor-analysis: PDF/PNG generati correttamente.");
          if (stdout) console.log("[INIT][BG] generate-competitor-analysis stdout:", stdout.trim().slice(0, 200));
        }
      });
    } else {
      console.log("[INIT][BG] competitor-analysis.pdf/png già presenti — generazione saltata.");
    }
  });
}

export async function initMissingClubConversations() {
  try {
    const clubs = await db
      .select({ id: motoClubs.id, name: motoClubs.name, conversationId: motoClubs.conversationId })
      .from(motoClubs)
      .where(eq(motoClubs.isApproved, true));

    let synced = 0;
    for (const club of clubs) {
      try {
        let convId = club.conversationId;

        if (convId) {
          const existing = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.id, convId))
            .limit(1);
          if (existing.length === 0) {
            convId = null;
            await db.update(motoClubs)
              .set({ conversationId: null, updatedAt: new Date() })
              .where(eq(motoClubs.id, club.id));
          }
        }

        if (!convId) {
          const [conv] = await db.insert(conversations).values({
            conversationType: "motoclub",
            title: `Club ${club.name}`,
          }).returning();
          convId = conv.id;

          await db.update(motoClubs)
            .set({ conversationId: convId, updatedAt: new Date() })
            .where(eq(motoClubs.id, club.id));
        }

        const members = await db
          .select({ userId: motoClubMembers.userId })
          .from(motoClubMembers)
          .where(and(eq(motoClubMembers.clubId, club.id), eq(motoClubMembers.status, "active")));

        if (members.length > 0) {
          const rows = members.map((m) => ({ conversationId: convId as string, userId: m.userId }));
          await db.insert(conversationParticipants).values(rows).onConflictDoNothing();
        }

        synced++;
      } catch (clubErr) {
        console.warn(`[INIT] initMissingClubConversations error for club ${club.id}:`, clubErr);
      }
    }

    console.log(`[INIT] Club conversations synced for ${synced}/${clubs.length} approved clubs`);
  } catch (e) {
    console.warn("[INIT] initMissingClubConversations error:", e);
  }
}

