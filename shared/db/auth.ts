import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" }),
  codeType: varchar("code_type", { length: 30 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  target: varchar("target", { length: 255 }).notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("verification_codes_target_idx").on(table.target),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const phoneSharingTracker = pgTable("phone_sharing_tracker", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  sharedCount: integer("shared_count").notNull().default(0),
}, (table) => [
  uniqueIndex("phone_sharing_tracker_unique_idx").on(table.conversationId, table.userId),
]);

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = typeof verificationCodes.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type PhoneSharingTracker = typeof phoneSharingTracker.$inferSelect;
export type InsertPhoneSharingTracker = typeof phoneSharingTracker.$inferInsert;

export const registerSchema = z.object({
  nickname: z.string().min(3).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
    .regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola")
    .regex(/[0-9]/, "La password deve contenere almeno un numero"),
  userType: z.enum(["biker", "zavorrina", "coppia"]),
  sex: z.enum(["M", "F"]).optional(),
  coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).optional(),
  birthYear: z.number().int().min(1940).max(2010).optional(),
  region: z.string().max(100).optional(),
  country: z.string().max(2).optional(),
  eulaAccepted: z.literal(true, {
    message: "Devi accettare i termini di utilizzo",
  }),
  invitationCode: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, "Inserisci email o nickname"),
  password: z.string().min(1, "Inserisci la password"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  platform: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const clientErrorReportSchema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(5000).optional(),
  componentStack: z.string().max(2000).optional(),
  platform: z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
});
export type ClientErrorReportInput = z.infer<typeof clientErrorReportSchema>;
