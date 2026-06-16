import { eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  passwordResetTokens, emailVerificationTokens, verificationCodes,
  type VerificationCode, type InsertVerificationCode,
  type EmailVerificationToken,
} from "@shared/db";
import { UsersStorage } from "./users";

export class AuthStorage extends UsersStorage {
  async createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode> {
    const [code] = await db.insert(verificationCodes).values(data).returning();
    return code;
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string) {
    const [row] = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, false))).limit(1);
    return row;
  }

  async getPasswordResetTokenByCode(userId: string, code: string) {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), eq(passwordResetTokens.token, code), eq(passwordResetTokens.used, false)))
      .limit(1);
    return row;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.token, token));
  }

  async markPasswordResetTokenUsedById(id: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, id));
  }

  async markUserEmailVerified(userId: string): Promise<void> {
    const { users } = await import("@shared/db");
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  }

  async deletePasswordResetTokens(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async createEmailVerificationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db.insert(emailVerificationTokens).values({ userId, token, expiresAt });
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
    return row;
  }

  async deleteEmailVerificationTokens(userId: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  }
}
