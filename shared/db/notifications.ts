import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";

export const notificationHistory = pgTable("notification_history", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }),
  notificationType: varchar("notification_type", { length: 60 })
    .notNull()
    .default("unknown"),
  token: text("token"),
  status: varchar("status", { length: 20 })
    .notNull()
    .default("sent"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at")
    .notNull()
    .defaultNow(),
}, (table) => [
  index("notification_history_created_at_idx").on(table.createdAt),
  index("notification_history_status_created_idx").on(table.status, table.createdAt),
  index("notification_history_user_id_idx").on(table.userId),
]);

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;
