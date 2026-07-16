import { Client } from "@replit/object-storage";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    _client = new Client();
  }
  return _client;
}

export interface StorageFile {
  name: string;
  size: number;
  createdTime: string;
}

export async function uploadBuffer(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const client = getClient();
  const result = await client.uploadFromBytes(objectPath, buffer, {
    contentType,
  } as Record<string, string>);
  if (!result.ok) {
    throw new Error(`Upload fallito per ${objectPath}: ${result.error?.message}`);
  }
}

export async function downloadBuffer(objectPath: string): Promise<Buffer> {
  const client = getClient();
  const tmpPath = join(tmpdir(), `ota-dl-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const result = await client.downloadToFilename(objectPath, tmpPath);
  if (!result.ok) {
    throw new Error(`Download fallito per ${objectPath}: ${result.error?.message}`);
  }
  const buffer = readFileSync(tmpPath);
  try { unlinkSync(tmpPath); } catch { /* no-op: cleanup cleanup */ }
  return buffer;
}

export async function deleteObject(objectPath: string): Promise<void> {
  const client = getClient();
  const result = await client.delete(objectPath);
  if (!result.ok) {
    throw new Error(`Eliminazione fallita per ${objectPath}: ${result.error?.message}`);
  }
}

export async function objectExists(objectPath: string): Promise<boolean> {
  const client = getClient();
  const result = await client.exists(objectPath);
  return result.ok && result.value === true;
}

interface StorageClientWithGCS {
  getBucket(): Promise<{ file(path: string): { publicUrl(): string } }>;
}

export async function getPublicUrl(objectPath: string): Promise<string> {
  const client = getClient();
  const bucket = await (client as unknown as StorageClientWithGCS).getBucket();
  const file = bucket.file(objectPath);
  return file.publicUrl();
}

// ── Bucket folder constants ───────────────────────────────────────────────────
/** Object-storage prefix for wishlist photos (zavorrina). */
export const BUCKET_WISHLIST = "Wishlist/";

// Task #1123: OTA bundle path validator. The OTA upload route writes bundles
// strictly under `private/ota/<filename>.js` (server/routes/admin.ts /ota/upload).
// Both the metadata insert and the public asset serve path MUST validate any
// `bundle_path` against this regex before passing it to the privileged
// object-storage client. Without this gate an admin (or attacker with an
// admin session) could publish an OTA release whose `bundlePath` points at
// arbitrary private objects (`.private/backups/...`, internal media, etc),
// turning the unauthenticated `/api/expo-updates/assets/:releaseId` route into
// a public file-serving primitive for anything readable by the server.
const OTA_BUNDLE_REGEX = /^private\/ota\/[A-Za-z0-9._-]+\.js$/;

export function isValidOtaBundlePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (p.length === 0 || p.length > 256) return false;
  if (p.includes("..")) return false;
  return OTA_BUNDLE_REGEX.test(p);
}

// ── Bucket path constants ─────────────────────────────────────────────────────
// These are the canonical prefixes for each media category in bikerlinkBucket.
// All upload / serve / delete code MUST use these constants — never raw strings.

/** Prefix for ad-campaign images: `Campaign/ads/<filename>` */
export const BUCKET_CAMPAIGN = "Campaign/ads/";
/** Prefix for photo-contest entries: `PhotoContest/<filename>` */
export const BUCKET_CONTEST = "PhotoContest/";
/** Prefix for user profile photos: `ProfilePic/<filename>` */
export const BUCKET_PROFILE_PIC = "ProfilePic/";
/** Prefix for motorcycle gallery photos: `ProfilePic/motorcycles/<filename>` */
export const BUCKET_MOTO_PIC = "ProfilePic/motorcycles/";

export async function listObjects(prefix: string): Promise<StorageFile[]> {
  const client = getClient();
  const result = await client.list({ prefix });
  if (!result.ok) {
    return [];
  }
  const objects = result.value ?? [];
  return objects.map((obj: { name: string; size?: number; createdAt?: { toISOString?: () => string } }) => ({
    name: obj.name as string,
    size: obj.size ?? 0,
    createdTime: obj.createdAt?.toISOString?.() ?? new Date().toISOString(),
  }));
}
