import bcrypt from "bcryptjs";
import { db } from "../db";
import { users, userProfiles } from "@shared/db";
import { eq } from "drizzle-orm";

export const FORBIDDEN_SEED_PASSWORDS = new Set<string>([
  "admin",
  "password",
  "123456",
  "changeme",
  "qwerty",
  "letmein",
]);

export const MIN_SEED_PASSWORD_LENGTH = 12;

export function isPasswordTooWeak(pw: string): string | null {
  if (pw.length < MIN_SEED_PASSWORD_LENGTH) {
    return `length < ${MIN_SEED_PASSWORD_LENGTH}`;
  }
  if (FORBIDDEN_SEED_PASSWORDS.has(pw)) {
    return "matches a previously-leaked / banned default";
  }
  return null;
}

interface EssentialUserDef {
  nickname: string;
  email: string;
  passwordEnvVar: string;
  role: string;
  userType: string;
  sex: string;
}

const essentialUsers: EssentialUserDef[] = [
  {
    nickname: "admin",
    email: "admin@bikerlink.it",
    passwordEnvVar: "BIKERLINK_ADMIN_PASSWORD",
    role: "admin",
    userType: "biker",
    sex: "M",
  },
  {
    nickname: "moderatore",
    email: "mod@bikerlink.it",
    passwordEnvVar: "MOD_SEED_PASSWORD",
    role: "moderator",
    userType: "biker",
    sex: "M",
  },
  {
    nickname: "mendo",
    email: "andreagranara@gmail.com",
    passwordEnvVar: "MENDO_SEED_PASSWORD",
    role: "admin",
    userType: "biker",
    sex: "M",
  },
];

export async function autoSeedEssentialUsers() {
  try {
    for (const userData of essentialUsers) {
      const seedPassword = process.env[userData.passwordEnvVar];
      if (!seedPassword) {
        console.warn(`[auto-seed] Skipping ${userData.role} seed: ${userData.passwordEnvVar} env var not set`);
        continue;
      }

      const weakReason = isPasswordTooWeak(seedPassword);

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existing.length > 0) {
        if (weakReason) {
          console.warn(
            `[auto-seed][SECURITY WARNING] Syncing ${userData.role} (${userData.email}) with a known-weak credential: ${weakReason}. Please rotate ${userData.passwordEnvVar} immediately.`,
          );
        }
        const hashedPassword = await bcrypt.hash(seedPassword, 12);
        await db
          .update(users)
          .set({ password: hashedPassword, status: "active", emailVerified: true })
          .where(eq(users.email, userData.email));
        console.log(`[auto-seed][AUDIT] Synced privileged user credentials: ${userData.nickname} role=${userData.role} email=${userData.email}`);
        continue;
      }

      if (weakReason) {
        console.error(
          `[auto-seed] REFUSING to create ${userData.role} (${userData.email}): ${userData.passwordEnvVar} ${weakReason}`,
        );
        continue;
      }

      const hashedPassword = await bcrypt.hash(seedPassword, 12);

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
      console.log(`[auto-seed][AUDIT] Bootstrapped privileged user: ${user.nickname} role=${user.role} email=${user.email}`);
    }
  } catch (err) {
    console.error("Auto-seed essential users failed:", err);
  }
}
