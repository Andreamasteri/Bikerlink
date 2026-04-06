import { Client } from "@replit/object-storage";

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
    headers: { "Content-Type": contentType },
  });
  if (!result.ok) {
    throw new Error(`Upload fallito per ${objectPath}: ${result.error?.message}`);
  }
}

export async function downloadBuffer(objectPath: string): Promise<Buffer> {
  const client = getClient();
  const result = await client.downloadAsBytes(objectPath);
  if (!result.ok) {
    throw new Error(`Download fallito per ${objectPath}: ${result.error?.message}`);
  }
  const chunks = result.value as Buffer[];
  return Buffer.concat(chunks);
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

export async function listObjects(prefix: string): Promise<StorageFile[]> {
  const client = getClient();
  const result = await client.list({ prefix });
  if (!result.ok) {
    return [];
  }
  const objects = result.value ?? [];
  return objects.map((obj: any) => ({
    name: obj.name as string,
    size: obj.size ?? 0,
    createdTime: obj.createdAt?.toISOString?.() ?? new Date().toISOString(),
  }));
}
