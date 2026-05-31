import bcrypt from "bcryptjs";
import crypto from "node:crypto";
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

function generateFirstBootPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

function printFirstBootBox(nickname: string, email: string, password: string): void {
  const W = 56;
  const line = "═".repeat(W);
  const row = (s: string) => {
    const padded = s.padEnd(W - 2, " ");
    return `║ ${padded} ║`;
  };
  console.log(`\n╔${line}╗`);
  console.log(row(`[SEED] ${nickname.toUpperCase()} — first-boot credential`));
  console.log(row(`email:    ${email}`));
  console.log(row(`password: ${password}`));
  console.log(row("Salva questa password — non verrà mostrata di nuovo"));
  console.log(`╚${line}╝\n`);
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
  {
    nickname: "smoke",
    email: "smoke@bikerlink.test",
    passwordEnvVar: "SMOKE_SEED_PASSWORD",
    role: "user",
    userType: "biker",
    sex: "M",
  },
];

export async function autoSeedEssentialUsers() {
  try {
    for (const userData of essentialUsers) {
      const seedPassword = process.env[userData.passwordEnvVar];

      if (!seedPassword) {
        // In produzione (autoscale deployato) non creiamo mai account privilegiati
        // con password casuali — un env var esplicita è obbligatoria.
        // REPLIT_DEPLOYMENT=1 è presente solo nei container autoscale deployati,
        // assente nel workspace di sviluppo (anche se NODE_ENV=production).
        if (process.env.REPLIT_DEPLOYMENT === "1") {
          console.warn(
            `[auto-seed] Skipping ${userData.role} seed: ${userData.passwordEnvVar} env var not set`,
          );
          continue;
        }

        // In sviluppo: se l'utente non esiste ancora, lo creiamo con una
        // password casuale forte (first-boot credential) e la stampiamo
        // UNA SOLA VOLTA nel log. Se esiste già, saltiamo silenziosamente.
        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, userData.email))
          .limit(1);

        if (existing.length > 0) {
          continue;
        }

        const firstBootPw = generateFirstBootPassword();
        const hashedPassword = await bcrypt.hash(firstBootPw, 12);

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
            emailVerified: true,
            isFake: false,
          })
          .returning();

        await db.insert(userProfiles).values({ userId: user.id });

        printFirstBootBox(userData.nickname, userData.email, firstBootPw);
        console.log(
          `[auto-seed][AUDIT] Bootstrapped ${userData.role} with first-boot credential: ${userData.nickname} email=${userData.email}`,
        );
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
        console.log(
          `[auto-seed][AUDIT] Synced privileged user credentials: ${userData.nickname} role=${userData.role} email=${userData.email}`,
        );
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
          emailVerified: true,
          isFake: false,
        })
        .returning();

      await db.insert(userProfiles).values({ userId: user.id });
      console.log(
        `[auto-seed][AUDIT] Bootstrapped privileged user: ${user.nickname} role=${user.role} email=${user.email}`,
      );
    }
  } catch (err) {
    console.error("Auto-seed essential users failed:", err);
  }
}
