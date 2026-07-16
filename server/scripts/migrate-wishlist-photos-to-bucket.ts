/**
 * One-time idempotent migration: move pre-bucket wishlist photos from the
 * ephemeral `uploads/wishlist/` directory into the object-storage bucket
 * (`Wishlist/<filename>`) and update the DB `photo_url` column so the serve
 * route (`/api/wishlist/photos/:filename`) works after the next deploy.
 *
 * Safe to re-run: already-migrated files are skipped (bucket existence check).
 * A single file failure is logged but does NOT abort the rest of the batch.
 */

import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { zavorrinaWishlistPhotos } from "@shared/db";
import { uploadBuffer, objectExists, BUCKET_WISHLIST } from "../objectStorage";

const LEGACY_DIR = path.join(process.cwd(), "uploads", "wishlist");
const LEGACY_URL_PREFIX = "/uploads/wishlist/";
const NEW_URL_PREFIX = "/api/wishlist/photos/";

/** Returns true if at least one file was found in the legacy directory. */
export async function migrateWishlistPhotosToBucket(): Promise<void> {
  const tag = "[wishlist-photo-migration]";

  // 1. Check the legacy directory exists and has files.
  if (!fs.existsSync(LEGACY_DIR)) {
    console.log(`${tag} legacy dir not found — nothing to migrate.`);
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(LEGACY_DIR, { withFileTypes: true });
  } catch (err) {
    console.error(`${tag} failed to read legacy dir:`, err);
    return;
  }

  const files = entries.filter((e) => e.isFile());
  if (files.length === 0) {
    console.log(`${tag} legacy dir is empty — nothing to migrate.`);
    return;
  }

  console.log(`${tag} found ${files.length} file(s) to migrate.`);

  // 2. Fetch all DB rows that still point at the legacy disk path.
  let legacyRows: Array<{ id: string; photoUrl: string }>;
  try {
    legacyRows = await db
      .select({ id: zavorrinaWishlistPhotos.id, photoUrl: zavorrinaWishlistPhotos.photoUrl })
      .from(zavorrinaWishlistPhotos);
    // Keep only the rows that use the legacy URL scheme.
    legacyRows = legacyRows.filter((r) => r.photoUrl.startsWith(LEGACY_URL_PREFIX));
  } catch (err) {
    console.error(`${tag} failed to query DB:`, err);
    return;
  }

  // Build a lookup: filename → DB row id
  const dbByFilename = new Map<string, string>();
  for (const row of legacyRows) {
    const filename = path.basename(row.photoUrl);
    dbByFilename.set(filename, row.id);
  }

  console.log(`${tag} ${legacyRows.length} DB row(s) still use legacy URL.`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of files) {
    const filename = entry.name;
    const diskPath = path.join(LEGACY_DIR, filename);
    const bucketPath = BUCKET_WISHLIST + filename;

    try {
      // 3a. Idempotency: skip if already in bucket.
      const alreadyInBucket = await objectExists(bucketPath);
      if (alreadyInBucket) {
        console.log(`${tag} [skip] ${filename} already in bucket.`);
        skipped++;
        // Still update the DB row if it's stale, so the URL stays consistent.
      } else {
        // 3b. Upload to bucket.
        const buffer = fs.readFileSync(diskPath);
        const ext = path.extname(filename).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
        };
        const contentType = mimeMap[ext] ?? "image/jpeg";
        await uploadBuffer(bucketPath, buffer, contentType);
        console.log(`${tag} [uploaded] ${filename} (${buffer.length} bytes).`);
      }

      // 4. Update the DB row if it still points at the legacy URL.
      const rowId = dbByFilename.get(filename);
      if (rowId) {
        const newUrl = NEW_URL_PREFIX + filename;
        await db
          .update(zavorrinaWishlistPhotos)
          .set({ photoUrl: newUrl })
          .where(eq(zavorrinaWishlistPhotos.id, rowId));
        console.log(`${tag} [db-updated] row ${rowId} → ${newUrl}`);
      }

      if (!alreadyInBucket) {
        migrated++;
      }
    } catch (err) {
      console.error(`${tag} [error] failed to migrate ${filename}:`, err);
      errors++;
      // Continue with remaining files — do NOT abort.
    }
  }

  console.log(
    `${tag} done. migrated=${migrated}, skipped=${skipped}, errors=${errors}.`,
  );
}
