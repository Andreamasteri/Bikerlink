import { db } from "../db";
import { userPrivacyLog } from "@shared/db";
import { eq, desc } from "drizzle-orm";
import { and } from "drizzle-orm";

const TRACKED_KEYS = [
  "fake_home_enabled",
  "fake_work_enabled",
  "fake_whatever_enabled",
  "position_fuzz",
  "fixed_position_enabled",
  "hide_from_map",
  "ghost_mode",
  "offline_position_randomize",
  "continuous_gps",
] as const;

export type PrivacySettingKey = (typeof TRACKED_KEYS)[number];

export async function logPrivacySetting(
  userId: string,
  settingKey: PrivacySettingKey,
  newValue: boolean,
): Promise<void> {
  try {
    const [lastRow] = await db
      .select({ newValue: userPrivacyLog.newValue })
      .from(userPrivacyLog)
      .where(
        and(
          eq(userPrivacyLog.userId, userId),
          eq(userPrivacyLog.settingKey, settingKey),
        ),
      )
      .orderBy(desc(userPrivacyLog.changedAt))
      .limit(1);

    if (lastRow !== undefined && lastRow.newValue === newValue) return;

    await db.insert(userPrivacyLog).values({
      userId,
      settingKey,
      newValue,
    });
  } catch (err) {
    console.warn(`[privacy-log] insert failed for ${userId}/${settingKey} (non-fatal):`, err);
  }
}

export function logPrivacySettingFireAndForget(
  userId: string,
  settingKey: PrivacySettingKey,
  newValue: boolean,
): void {
  logPrivacySetting(userId, settingKey, newValue).catch(() => {});
}
