import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, userProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { pool } from "./db";
import { storage } from "./storage";

const seedUsers = [
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
  {
    nickname: "user1",
    email: "user1@bikerlink.it",
    password: "test",
    role: "user",
    userType: "biker",
    sex: "M",
  },
];

async function seed() {
  console.log("Seeding database...");

  for (const userData of seedUsers) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`User "${userData.nickname}" already exists, skipping.`);
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

    console.log(
      `Created user "${user.nickname}" (${user.role}) with id ${user.id}`,
    );
  }

  for (const [key, value] of [
    ["maps_enabled", "true"],
    ["maps_provider", "carto_light"],
  ] as [string, string][]) {
    await storage.upsertAppSetting(key, value);
    console.log(`Seeded app setting "${key}" = "${value}"`);
  }

  console.log("Seed completed.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
