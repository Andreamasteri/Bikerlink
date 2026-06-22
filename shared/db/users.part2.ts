import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./users";

export const userPrivacyLog = pgTable("user_privacy_log", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  settingKey: varchar("setting_key", { length: 64 }).notNull(),
  newValue: boolean("new_value").notNull(),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
}, (table) => [
  index("user_privacy_log_user_id_changed_at_idx").on(table.userId, table.changedAt.desc()),
]);

export type UserPrivacyLog = typeof userPrivacyLog.$inferSelect;
export type InsertUserPrivacyLog = typeof userPrivacyLog.$inferInsert;

export const userReportSchema = z.object({
  reason: z.string().min(1, "Motivo obbligatorio"),
  description: z.string().max(500).optional(),
});
export type UserReportInput = z.infer<typeof userReportSchema>;

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password mancante"),
});
export type VerifyPasswordInput = z.infer<typeof verifyPasswordSchema>;

export const userStatusSchema = z.object({
  status: z.enum(["active", "suspended", "blocked"], { message: "Stato non valido" }),
});
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.object({
  role: z.enum(["user", "moderator", "admin"], { message: "Ruolo non valido" }),
});
export type UserRoleInput = z.infer<typeof userRoleSchema>;

export const userEmailAdminSchema = z.object({
  email: z.string().email("Email non valida"),
});
export type UserEmailAdminInput = z.infer<typeof userEmailAdminSchema>;

export const adminSetPasswordSchema = z.object({
  password: z.string().min(6, "La password deve avere almeno 6 caratteri"),
});
export type AdminSetPasswordInput = z.infer<typeof adminSetPasswordSchema>;

export const primalSchema = z.object({
  isPrimal: z.boolean().optional(),
});
export type PrimalInput = z.infer<typeof primalSchema>;
