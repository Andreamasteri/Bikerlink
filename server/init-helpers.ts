import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { 
  motoClubs, 
  motoClubMembers, 
  conversations, 
  conversationParticipants 
} from "@shared/db";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execFile } from "child_process";
import { createHash } from "crypto";

// ── Competitor analysis PDF/PNG — genera se mancante o script aggiornato ──
// Confronta lo SHA-256 di scripts/generate-competitor-analysis.js con quello
// salvato in server/public/assets/competitor-analysis.hash. Se differiscono
// (o se PDF/PNG mancano), rigenera in background e aggiorna il file hash.
// Il mancato completamento NON blocca il boot né il serving del resto.
export function ensureCompetitorAnalysisPdf(): void {
  setImmediate(() => {
    (async () => {
      const pdfPath = resolve(process.cwd(), "server/public/assets/competitor-analysis.pdf");
      const pngPath = resolve(process.cwd(), "server/public/assets/competitor-analysis.png");
      const hashPath = resolve(process.cwd(), "server/public/assets/competitor-analysis.hash");
      const scriptPath = resolve(process.cwd(), "scripts/generate-competitor-analysis.js");

      // Compute current script hash (empty string if script missing → always regenerate)
      let currentHash = "";
      if (existsSync(scriptPath)) {
        currentHash = createHash("sha256").update(readFileSync(scriptPath)).digest("hex");
      }

      // Read previously saved hash
      const savedHash = existsSync(hashPath) ? readFileSync(hashPath, "utf8").trim() : "";

      const pdfMissing = !existsSync(pdfPath) || !existsSync(pngPath);
      const scriptChanged = currentHash !== savedHash;

      if (pdfMissing || scriptChanged) {
        const reason = pdfMissing ? "PDF/PNG mancante" : "script aggiornato";
        console.log(`[INIT][BG] competitor-analysis — ${reason} — avvio generazione...`);
        await new Promise<void>((res) => {
          execFile(process.execPath, [scriptPath], { timeout: 60_000 }, (err, stdout, stderr) => {
            if (err) {
              console.warn("[INIT][BG] generate-competitor-analysis: ERRORE —", err.message);
              if (stderr) console.warn("[INIT][BG] generate-competitor-analysis stderr:", stderr.slice(0, 300));
            } else {
              console.log("[INIT][BG] generate-competitor-analysis: PDF/PNG generati correttamente.");
              if (stdout) console.log("[INIT][BG] generate-competitor-analysis stdout:", stdout.trim().slice(0, 200));
              // Salva il nuovo hash solo dopo generazione riuscita
              if (currentHash) {
                try {
                  writeFileSync(hashPath, currentHash, "utf8");
                  console.log("[INIT][BG] competitor-analysis.hash aggiornato.");
                } catch (we) {
                  console.warn("[INIT][BG] impossibile scrivere competitor-analysis.hash:", (we as Error).message);
                }
              }
            }
            res();
          });
        });
      } else {
        console.log("[INIT][BG] competitor-analysis.pdf/png aggiornati — generazione saltata.");
      }
    })().catch((e) => console.warn("[INIT][BG] competitor-analysis setup error:", e));
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
          .where(
            and(
              eq(motoClubMembers.clubId, club.id),
              eq(motoClubMembers.status, "approved")
            )
          );

        for (const member of members) {
          const existingParticipant = await db
            .select({ id: conversationParticipants.id })
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.conversationId, convId),
                eq(conversationParticipants.userId, member.userId)
              )
            )
            .limit(1);

          if (existingParticipant.length === 0) {
            await db.insert(conversationParticipants).values({
              conversationId: convId,
              userId: member.userId,
            });
          }
        }

        synced++;
      } catch (clubErr) {
        console.warn(`[initMissingClubConversations] error for club ${club.id}:`, clubErr);
      }
    }

    console.log(`[initMissingClubConversations] synced ${synced}/${clubs.length} clubs`);
  } catch (err) {
    console.warn("[initMissingClubConversations] fatal error:", err);
  }
}
