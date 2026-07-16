/**
 * scripts/migrate-legacy-bucket-paths.ts
 *
 * One-time migration: moves objects from the legacy bucket prefixes to the
 * canonical prefixes introduced in Task #189.
 *
 * Mapping:
 *   public/ads/      →  Campaign/ads/      (BUCKET_CAMPAIGN)
 *   public/contest/  →  PhotoContest/      (BUCKET_CONTEST)
 *   public/photos/   →  ProfilePic/        (BUCKET_PROFILE_PIC)
 *
 * The script is idempotent: if the target object already exists it is left
 * untouched and the source is still deleted (assuming a previous partial run
 * already migrated it).  Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-bucket-paths.ts
 *
 * Dry-run (no writes/deletes):
 *   DRY_RUN=1 npx tsx scripts/migrate-legacy-bucket-paths.ts
 */

import {
  listObjects,
  downloadBuffer,
  uploadBuffer,
  deleteObject,
  objectExists,
  BUCKET_CAMPAIGN,
  BUCKET_CONTEST,
  BUCKET_PROFILE_PIC,
} from "../server/objectStorage";
import path from "path";

const DRY_RUN = process.env.DRY_RUN === "1";

interface MigrationMapping {
  legacyPrefix: string;
  canonicalPrefix: string;
  label: string;
}

const MAPPINGS: MigrationMapping[] = [
  {
    legacyPrefix: "public/ads/",
    canonicalPrefix: BUCKET_CAMPAIGN,
    label: "Ads",
  },
  {
    legacyPrefix: "public/contest/",
    canonicalPrefix: BUCKET_CONTEST,
    label: "Contest",
  },
  {
    legacyPrefix: "public/photos/",
    canonicalPrefix: BUCKET_PROFILE_PIC,
    label: "ProfilePic",
  },
];

/** Infer a content-type from the file extension. Defaults to octet-stream. */
function contentTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
  };
  return map[ext] ?? "application/octet-stream";
}

async function migratePrefix(mapping: MigrationMapping): Promise<{
  migrated: number;
  skipped: number;
  failed: number;
}> {
  const { legacyPrefix, canonicalPrefix, label } = mapping;
  const stats = { migrated: 0, skipped: 0, failed: 0 };

  console.log(`\n[${label}] Listing objects under "${legacyPrefix}"…`);
  const objects = await listObjects(legacyPrefix);

  if (objects.length === 0) {
    console.log(`[${label}] No objects found — nothing to migrate.`);
    return stats;
  }

  console.log(`[${label}] Found ${objects.length} object(s).`);

  for (const obj of objects) {
    // Strip the legacy prefix to get the bare filename.
    const filename = obj.name.slice(legacyPrefix.length);

    // Skip sub-prefixes (e.g. "public/photos/subdir/...").
    if (!filename || filename.includes("/")) {
      console.log(`[${label}] Skip sub-prefix: ${obj.name}`);
      continue;
    }

    const targetPath = `${canonicalPrefix}${filename}`;
    const sourcePath = obj.name;

    // Idempotency: check whether the target already exists.
    let alreadyExists = false;
    try {
      alreadyExists = await objectExists(targetPath);
    } catch (err) {
      console.warn(`[${label}] objectExists check failed for "${targetPath}" — will attempt copy anyway:`, err);
    }

    if (alreadyExists) {
      console.log(`[${label}] Already at target — deleting source: ${sourcePath}`);
      if (!DRY_RUN) {
        try {
          await deleteObject(sourcePath);
        } catch (delErr) {
          console.warn(`[${label}] Failed to delete source "${sourcePath}" (non-fatal):`, delErr);
        }
      }
      stats.skipped++;
      continue;
    }

    // Download → upload → delete.
    console.log(`[${label}] Migrating: ${sourcePath} → ${targetPath}`);
    if (DRY_RUN) {
      console.log(`[${label}]   [DRY RUN] would copy and delete`);
      stats.migrated++;
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await downloadBuffer(sourcePath);
    } catch (downloadErr) {
      console.error(`[${label}] Download failed for "${sourcePath}":`, downloadErr);
      stats.failed++;
      continue;
    }

    const contentType = contentTypeFromFilename(filename);
    try {
      await uploadBuffer(targetPath, buffer, contentType);
    } catch (uploadErr) {
      console.error(`[${label}] Upload failed for "${targetPath}":`, uploadErr);
      stats.failed++;
      continue;
    }

    try {
      await deleteObject(sourcePath);
    } catch (delErr) {
      // Non-fatal: the object was already copied successfully. Log and move on.
      console.warn(`[${label}] Copied OK but failed to delete source "${sourcePath}" (non-fatal):`, delErr);
    }

    stats.migrated++;
    console.log(`[${label}] OK: ${filename}`);
  }

  return stats;
}

async function main() {
  if (DRY_RUN) {
    console.log("=== DRY RUN MODE — no writes or deletes will happen ===");
  }
  console.log("Starting legacy bucket path migration…");

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const mapping of MAPPINGS) {
    const result = await migratePrefix(mapping);
    totalMigrated += result.migrated;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
  }

  console.log("\n=== Migration complete ===");
  console.log(`  Migrated : ${totalMigrated}`);
  console.log(`  Skipped  : ${totalSkipped} (already at target)`);
  console.log(`  Failed   : ${totalFailed}`);

  if (totalFailed > 0) {
    console.error(`\n${totalFailed} object(s) failed to migrate. Check logs above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Migration script crashed:", err);
  process.exit(1);
});
