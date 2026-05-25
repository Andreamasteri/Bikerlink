import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "../db";
import { otaReleases } from "@shared/db";
import { and, desc, eq } from "drizzle-orm";

const router = Router();

const EAS_PROJECT_ID = "a25192d7-72e5-46af-97d0-2d38ed9b78e3";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

type ManifestObject = Record<string, unknown>;
type CachedManifest = { manifest: ManifestObject; expiresAt: number };
const manifestCache = new Map<string, CachedManifest>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateExpoUpdatesCache(): void {
  manifestCache.clear();
}

async function easGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const token = process.env.EAS_TOKEN;
  if (!token) throw new Error("EAS_TOKEN non configurato");
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EAS GraphQL HTTP ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors && (json.errors as unknown[]).length > 0) {
    throw new Error(`EAS GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function buildManifestFromEasGroup(
  easGroupId: string,
  platform: "ios" | "android",
  release: { easUpdateId: string; runtimeVersion: string | null },
): Promise<ManifestObject | null> {
  const cacheKey = `${easGroupId}:${platform}`;
  const cached = manifestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.manifest;

  const query = `
    query GetUpdatesByGroup($group: ID!) {
      updatesByGroup(group: $group) {
        id
        group
        platform
        runtimeVersion
        message
        createdAt
        manifestFragment
      }
    }
  `;
  const data = (await easGraphQL(query, { group: easGroupId })) as {
    updatesByGroup?: Array<{
      id: string;
      group: string;
      platform: string;
      runtimeVersion: string;
      message: string | null;
      createdAt: string;
      manifestFragment: string;
    }>;
  };
  const updates = data?.updatesByGroup ?? [];
  const upd = updates.find((u) => u.platform === platform);
  if (!upd) return null;

  let fragment: Record<string, unknown>;
  try {
    fragment = JSON.parse(upd.manifestFragment) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`manifestFragment JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const manifest: ManifestObject = {
    id: release.easUpdateId,
    createdAt: upd.createdAt,
    runtimeVersion: release.runtimeVersion ?? upd.runtimeVersion,
    launchAsset: fragment.launchAsset,
    assets: fragment.assets ?? [],
    metadata: fragment.metadata ?? {},
    extra: fragment.extra ?? {},
  };

  manifestCache.set(cacheKey, { manifest, expiresAt: Date.now() + CACHE_TTL_MS });
  return manifest;
}

function writeMultipartPart(res: Response, partName: "manifest" | "directive", payload: Record<string, unknown>): void {
  const boundary = `bikerlink-${crypto.randomBytes(8).toString("hex")}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${partName}"\r\n` +
    `Content-Type: application/json\r\n` +
    `\r\n` +
    JSON.stringify(payload) +
    `\r\n` +
    `--${boundary}--\r\n`;

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("cache-control", "private, max-age=0");
  res.setHeader("content-type", `multipart/mixed; boundary=${boundary}`);
  try { res.removeHeader("ETag"); } catch { /* noop */ }
  res.status(200).end(Buffer.from(body, "utf8"));
}

function writeManifest(res: Response, manifest: ManifestObject): void {
  writeMultipartPart(res, "manifest", manifest);
}

function writeDirective(res: Response, type: "noUpdateAvailable" | "rollBackToEmbedded"): void {
  writeMultipartPart(res, "directive", { type });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const platform = (req.header("expo-platform") ?? "").toLowerCase();
    const runtimeVersion = req.header("expo-runtime-version") ?? "";
    const currentUpdateId = req.header("expo-current-update-id") ?? "";

    if (platform !== "android" && platform !== "ios") {
      return writeDirective(res, "noUpdateAvailable");
    }

    // iOS gestito via TestFlight/App Store, mai OTA
    if (platform === "ios") {
      return writeDirective(res, "noUpdateAvailable");
    }

    if (!runtimeVersion) {
      return writeDirective(res, "noUpdateAvailable");
    }

    const [release] = await db
      .select()
      .from(otaReleases)
      .where(and(eq(otaReleases.status, "approved"), eq(otaReleases.runtimeVersion, runtimeVersion)))
      .orderBy(desc(otaReleases.publishedAt))
      .limit(1);

    if (!release || !release.easGroupId) {
      return writeDirective(res, "noUpdateAvailable");
    }

    if (currentUpdateId && currentUpdateId === release.easUpdateId) {
      return writeDirective(res, "noUpdateAvailable");
    }

    let manifest: ManifestObject | null = null;
    try {
      manifest = await buildManifestFromEasGroup(release.easGroupId, platform, {
        easUpdateId: release.easUpdateId,
        runtimeVersion: release.runtimeVersion,
      });
    } catch (err) {
      console.error("[expo-updates] buildManifestFromEasGroup error:", err);
      return writeDirective(res, "noUpdateAvailable");
    }

    if (!manifest) {
      return writeDirective(res, "noUpdateAvailable");
    }

    return writeManifest(res, manifest);
  } catch (err) {
    console.error("[expo-updates] handler error:", err);
    if (!res.headersSent) {
      return writeDirective(res, "noUpdateAvailable");
    }
  }
});

export default router;
