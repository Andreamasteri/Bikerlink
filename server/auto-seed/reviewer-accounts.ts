import bcrypt from "bcryptjs";
import { db } from "../db";
import { users, userProfiles, userMotorcycles, invitationCodes } from "@shared/db";
import { eq } from "drizzle-orm";
import { isPasswordTooWeak } from "./essential-users";

const APPLE_REVIEWER_EMAIL = "applereview@bikerlink.it";
const APPLE_REVIEWER_NICKNAME = "AppleReviewer";
const APPLE_REVIEW_INVITE_CODE = "APPLE-REVIEW-2026";

const GOOGLE_REVIEWER_EMAIL = "googlereview@bikerlink.it";
const GOOGLE_REVIEWER_NICKNAME = "GooglePlayReviewer";
const GOOGLE_REVIEW_INVITE_CODE = "GOOGLE-REVIEW-2026";

export async function seedAppleReviewerAccount(): Promise<void> {
  const appleReviewerPassword = process.env.APPLE_REVIEWER_PASSWORD;
  if (!appleReviewerPassword) {
    console.warn("[SEED] APPLE_REVIEWER_PASSWORD env var not set — skipping Apple Reviewer seed");
    return;
  }

  const weakReason = isPasswordTooWeak(appleReviewerPassword);
  if (weakReason) {
    console.error(`[SEED] REFUSING to seed Apple Reviewer: APPLE_REVIEWER_PASSWORD ${weakReason}`);
    return;
  }

  try {
    await db
      .insert(invitationCodes)
      .values({
        code: APPLE_REVIEW_INVITE_CODE,
        label: "Apple Review",
        maxUses: 100,
        currentUses: 0,
        isActive: true,
      })
      .onConflictDoNothing();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, APPLE_REVIEWER_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const hashedPassword = await bcrypt.hash(appleReviewerPassword, 12);

    const [user] = await db
      .insert(users)
      .values({
        nickname: APPLE_REVIEWER_NICKNAME,
        email: APPLE_REVIEWER_EMAIL,
        password: hashedPassword,
        role: "user",
        userType: "biker",
        sex: "M",
        birthYear: 1990,
        region: "Toscana",
        country: "IT",
        emailVerified: true,
        eulaAccepted: true,
        privacyAccepted: true,
        consentAcceptedAt: new Date(),
        isFake: false,
        invitationCode: APPLE_REVIEW_INVITE_CODE,
      })
      .returning({ id: users.id });

    if (!user) return;

    await db.insert(userProfiles).values({
      userId: user.id,
      isAvailable: true,
      latitude: 43.7696,
      longitude: 11.2558,
      bio: "Account di test per la review di Apple. Motociclista appassionato con anni di esperienza sulle strade toscane.",
      searchPreference: "both",
    }).onConflictDoNothing();

    await db.insert(userMotorcycles).values({
      userId: user.id,
      brand: "Ducati",
      model: "Monster 937",
      year: 2022,
      displacement: 937,
    });

    console.log("[SEED] AppleReviewer account provisioned");
  } catch (err) {
    console.warn("[SEED] seedAppleReviewerAccount error:", err);
  }
}

export async function seedGooglePlayReviewerAccount(): Promise<void> {
  const googleReviewerPassword = process.env.GOOGLE_PLAY_REVIEWER_PASSWORD;
  if (!googleReviewerPassword) {
    console.warn("[SEED] GOOGLE_PLAY_REVIEWER_PASSWORD env var not set — skipping Google Play Reviewer seed");
    return;
  }

  const weakReason = isPasswordTooWeak(googleReviewerPassword);
  if (weakReason) {
    console.error(`[SEED] REFUSING to seed Google Play Reviewer: GOOGLE_PLAY_REVIEWER_PASSWORD ${weakReason}`);
    return;
  }

  try {
    await db
      .insert(invitationCodes)
      .values({
        code: GOOGLE_REVIEW_INVITE_CODE,
        label: "Google Play Review",
        maxUses: 100,
        currentUses: 0,
        isActive: true,
      })
      .onConflictDoNothing();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, GOOGLE_REVIEWER_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const hashedPassword = await bcrypt.hash(googleReviewerPassword, 12);

    const [user] = await db
      .insert(users)
      .values({
        nickname: GOOGLE_REVIEWER_NICKNAME,
        email: GOOGLE_REVIEWER_EMAIL,
        password: hashedPassword,
        role: "user",
        userType: "biker",
        sex: "M",
        birthYear: 1991,
        region: "Toscana",
        country: "IT",
        emailVerified: true,
        eulaAccepted: true,
        privacyAccepted: true,
        consentAcceptedAt: new Date(),
        isFake: false,
        invitationCode: GOOGLE_REVIEW_INVITE_CODE,
      })
      .returning({ id: users.id });

    if (!user) return;

    await db.insert(userProfiles).values({
      userId: user.id,
      isAvailable: true,
      latitude: 43.7696,
      longitude: 11.2558,
      bio: "Account di test per la review di Google Play. Motociclista appassionato con anni di esperienza sulle strade toscane.",
      searchPreference: "both",
    }).onConflictDoNothing();

    await db.insert(userMotorcycles).values({
      userId: user.id,
      brand: "BMW",
      model: "R 1250 GS",
      year: 2023,
      displacement: 1254,
    });

    console.log("[SEED] GooglePlayReviewer account provisioned");
  } catch (err) {
    console.warn("[SEED] seedGooglePlayReviewerAccount error:", err);
  }
}
