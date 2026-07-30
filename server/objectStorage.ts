import { createHash, createHmac } from "node:crypto";

export interface StorageFile {
  name: string;
  size: number;
  createdTime: string;
}

interface R2Config {
  endpoint: URL;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl?: string;
}

const PRIVATE_PREFIXES = ["private/", ".private/"] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} deve essere configurato per usare Cloudflare R2.`);
  }
  return value;
}

function getConfig(): R2Config {
  const endpoint = new URL(required("R2_ENDPOINT"));
  if (endpoint.protocol !== "https:") {
    throw new Error("R2_ENDPOINT deve usare HTTPS.");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");

  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (publicBaseUrl && new URL(publicBaseUrl).protocol !== "https:") {
    throw new Error("R2_PUBLIC_BASE_URL deve usare HTTPS.");
  }

  return {
    endpoint,
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    publicBucket: required("R2_PUBLIC_BUCKET"),
    privateBucket: required("R2_PRIVATE_BUCKET"),
    publicBaseUrl,
  };
}

function normalizeObjectPath(objectPath: string): string {
  const value = objectPath.trim();
  if (
    !value ||
    value.length > 1024 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((part) => part === "..")
  ) {
    throw new Error("Percorso object storage non valido.");
  }
  return value;
}

function isPrivateObjectPath(objectPath: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => objectPath.startsWith(prefix));
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeObjectPath(value: string): string {
  return value.split("/").map(encodeRfc3986).join("/");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function canonicalQuery(searchParams: URLSearchParams): string {
  return [...searchParams.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const compact = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: compact,
    dateStamp: compact.slice(0, 8),
  };
}

function bucketForPath(config: R2Config, objectPath: string): string {
  return isPrivateObjectPath(objectPath)
    ? config.privateBucket
    : config.publicBucket;
}

async function r2Request(
  method: "GET" | "PUT" | "DELETE" | "HEAD",
  options: {
    objectPath?: string;
    prefix?: string;
    continuationToken?: string;
    body?: Buffer;
    contentType?: string;
  } = {}
): Promise<Response> {
  const config = getConfig();
  const normalizedPath = options.objectPath
    ? normalizeObjectPath(options.objectPath)
    : undefined;
  const normalizedPrefix = options.prefix
    ? normalizeObjectPath(options.prefix)
    : undefined;
  const routingPath = normalizedPath ?? normalizedPrefix;
  if (!routingPath) {
    throw new Error("Percorso o prefisso R2 mancante.");
  }

  const bucket = bucketForPath(config, routingPath);
  const url = new URL(config.endpoint.toString());
  const keyPath = normalizedPath ? `/${encodeObjectPath(normalizedPath)}` : "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeRfc3986(bucket)}${keyPath}`;
  if (normalizedPrefix) {
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", normalizedPrefix);
    if (options.continuationToken) {
      url.searchParams.set("continuation-token", options.continuationToken);
    }
  }

  const payloadHash = sha256(options.body ?? "");
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const signedHeaderValues: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.contentType) {
    signedHeaderValues["content-type"] = options.contentType;
  }
  const signedHeaderNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeaderValues[name].trim()}\n`)
    .join("");
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaderNames.join(";"),
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), "auto"),
      "s3"
    ),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
  };
  if (options.contentType) headers["content-type"] = options.contentType;

  return fetch(url, {
    method,
    headers,
    body: options.body ? Uint8Array.from(options.body) : undefined,
  });
}

async function assertSuccessful(
  response: Response,
  operation: string,
  objectPath: string
): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `${operation} fallito per ${objectPath}: R2 HTTP ${response.status}`
    );
  }
}

export async function uploadBuffer(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const response = await r2Request("PUT", { objectPath, body: buffer, contentType });
  await assertSuccessful(response, "Upload", objectPath);
}

export async function downloadBuffer(objectPath: string): Promise<Buffer> {
  const response = await r2Request("GET", { objectPath });
  await assertSuccessful(response, "Download", objectPath);
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteObject(objectPath: string): Promise<void> {
  const response = await r2Request("DELETE", { objectPath });
  await assertSuccessful(response, "Eliminazione", objectPath);
}

export async function objectExists(objectPath: string): Promise<boolean> {
  const response = await r2Request("HEAD", { objectPath });
  if (response.status === 404) return false;
  await assertSuccessful(response, "Verifica esistenza", objectPath);
  return true;
}

export async function getPublicUrl(objectPath: string): Promise<string> {
  const normalizedPath = normalizeObjectPath(objectPath);
  if (isPrivateObjectPath(normalizedPath)) {
    throw new Error("Un oggetto privato non può avere un URL pubblico.");
  }
  const publicBaseUrl = getConfig().publicBaseUrl;
  if (!publicBaseUrl) {
    throw new Error("R2_PUBLIC_BASE_URL deve essere configurato.");
  }
  return `${publicBaseUrl.replace(/\/+$/, "")}/${encodeObjectPath(normalizedPath)}`;
}

// ── Bucket folder constants ───────────────────────────────────────────────────
/** Object-storage prefix for wishlist photos (zavorrina). */
export const BUCKET_WISHLIST = "Wishlist/";

// Task #1123: OTA bundle path validator. The OTA upload route writes bundles
// strictly under `private/ota/<filename>.js` (server/routes/admin.ts /ota/upload).
// Both the metadata insert and the public asset serve path MUST validate any
// `bundle_path` against this regex before passing it to the privileged
// object-storage client.
const OTA_BUNDLE_REGEX = /^private\/ota\/[A-Za-z0-9._-]+\.js$/;

export function isValidOtaBundlePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (p.length === 0 || p.length > 256) return false;
  if (p.includes("..")) return false;
  return OTA_BUNDLE_REGEX.test(p);
}

/** Prefix for ad-campaign images: `Campaign/ads/<filename>` */
export const BUCKET_CAMPAIGN = "Campaign/ads/";
/** Prefix for photo-contest entries: `PhotoContest/<filename>` */
export const BUCKET_CONTEST = "PhotoContest/";
/** Prefix for user profile photos: `ProfilePic/<filename>` */
export const BUCKET_PROFILE_PIC = "ProfilePic/";
/** Prefix for motorcycle gallery photos: `ProfilePic/motorcycles/<filename>` */
export const BUCKET_MOTO_PIC = "ProfilePic/motorcycles/";

function xmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i")
  );
  return match?.[1]
    ?.replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function listObjects(prefix: string): Promise<StorageFile[]> {
  const normalizedPrefix = normalizeObjectPath(prefix);
  const files: StorageFile[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await r2Request("GET", {
      prefix: normalizedPrefix,
      continuationToken,
    });
    await assertSuccessful(response, "Elenco", normalizedPrefix);
    const xml = await response.text();
    const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/gi) ?? [];
    for (const content of contents) {
      const name = xmlValue(content, "Key");
      if (!name) continue;
      files.push({
        name,
        size: Number(xmlValue(content, "Size") ?? 0),
        createdTime:
          xmlValue(content, "LastModified") ?? new Date(0).toISOString(),
      });
    }
    const truncated = xmlValue(xml, "IsTruncated") === "true";
    continuationToken = truncated
      ? xmlValue(xml, "NextContinuationToken")
      : undefined;
    if (truncated && !continuationToken) {
      throw new Error("R2 ha indicato una pagina successiva senza token.");
    }
  } while (continuationToken);

  return files;
}
