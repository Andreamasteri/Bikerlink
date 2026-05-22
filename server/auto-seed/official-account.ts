import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";

export async function ensureBikerLinkOfficialOnBoot(): Promise<void> {
  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nickname, "BikerLink_Official"))
      .limit(1);

    if (existing.length > 0) {
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
      isFake: true,
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
