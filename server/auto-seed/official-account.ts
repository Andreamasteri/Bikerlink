import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";

export async function ensureBikerLinkOfficialOnBoot(): Promise<void> {
  try {
    const existing = await db
      .select({ id: users.id, isSystem: users.isSystem })
      .from(users)
      .where(eq(users.nickname, "BikerLink_Official"))
      .limit(1);

    if (existing.length > 0) {
      // Task #2794 — migra il record esistente al nuovo flag isSystem.
      if (existing[0].isSystem !== true) {
        await db
          .update(users)
          .set({ isSystem: true })
          .where(eq(users.id, existing[0].id));
        console.log("[SEED] BikerLink_Official migrated to isSystem=true");
      }
      return;
    }

    const noLoginPw = await bcrypt.hash(
      `__system_nologin__${Date.now()}__${crypto.randomBytes(16).toString("hex")}`,
      12
    );

    await db.insert(users).values({
      nickname: "BikerLink_Official",
      email: "noreply-system@bikerlink.internal",
      password: noLoginPw,
      userType: "biker",
      sex: "M",
      role: "user",
      isSystem: true,
      isFake: false,
      region: "Lombardia",
      birthYear: 2000,
      emailVerified: false,
      eulaAccepted: false,
    });

    console.log("[SEED] BikerLink_Official account re-created on boot");
  } catch (err) {
    console.warn("[SEED] ensureBikerLinkOfficialOnBoot error:", err);
  }
}
