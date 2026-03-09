import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, userProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";

const essentialUsers = [
  {
    nickname: "admin",
    email: "admin@bikerlink.it",
    password: "admin2025!",
    role: "admin",
    userType: "biker",
    sex: "M",
  },
  {
    nickname: "moderatore",
    email: "mod@bikerlink.it",
    password: "mod2025!",
    role: "moderator",
    userType: "biker",
    sex: "M",
  },
];

export async function autoSeedEssentialUsers() {
  try {
    for (const userData of essentialUsers) {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 12);

      const [user] = await db
        .insert(users)
        .values({
          nickname: userData.nickname,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          userType: userData.userType,
          sex: userData.sex,
          eulaAccepted: true,
        })
        .returning();

      await db.insert(userProfiles).values({ userId: user.id });

      console.log(`Auto-seeded essential user: ${user.nickname} (${user.role})`);
    }
  } catch (err) {
    console.error("Auto-seed failed:", err);
  }
}
