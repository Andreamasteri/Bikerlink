import { google } from "googleapis";
import { Readable } from "stream";

let _auth: any = null;
let _drive: any = null;

function getAuth() {
  if (_auth) return _auth;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY non configurato");
  const credentials = JSON.parse(keyJson);
  _auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return _auth;
}

function getDrive() {
  if (_drive) return _drive;
  _drive = google.drive({ version: "v3", auth: getAuth() });
  return _drive;
}

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDrive();
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q, fields: "files(id,name)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id as string;
  }
  const meta: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) meta.parents = [parentId];
  const created = await drive.files.create({ requestBody: meta, fields: "id" });
  return created.data.id as string;
}

export async function getOrCreateFolderPath(folderPath: string): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  let parentId: string | undefined = undefined;
  for (const part of parts) {
    parentId = await findOrCreateFolder(part, parentId);
  }
  return parentId as string;
}

export async function uploadFile(
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  folderPath: string
): Promise<{ id: string; name: string }> {
  const drive = getDrive();
  const folderId = await getOrCreateFolderPath(folderPath);
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id,name,size,createdTime",
  });
  return { id: res.data.id as string, name: res.data.name as string };
}

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
}

export async function listFiles(folderPath: string): Promise<DriveFile[]> {
  const drive = getDrive();
  const parts = folderPath.split("/").filter(Boolean);
  let parentId: string | undefined = undefined;
  try {
    for (const part of parts) {
      const q = parentId
        ? `name='${part}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
        : `name='${part}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const res = await drive.files.list({ q, fields: "files(id)" });
      if (!res.data.files || res.data.files.length === 0) return [];
      parentId = res.data.files[0].id as string;
    }
  } catch {
    return [];
  }

  if (!parentId) return [];

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: "nextPageToken,files(id,name,size,createdTime)",
      pageSize: 100,
      pageToken,
    });
    const files = res.data.files || [];
    allFiles.push(...files.map((f: any) => ({
      id: f.id,
      name: f.name,
      size: parseInt(f.size || "0"),
      createdTime: f.createdTime,
    })));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

export async function listAllBackupFiles(rootFolder: string): Promise<DriveFile[]> {
  const drive = getDrive();
  let rootId: string | undefined = undefined;
  try {
    const rootQ = `name='${rootFolder}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const rootRes = await drive.files.list({ q: rootQ, fields: "files(id)" });
    if (!rootRes.data.files || rootRes.data.files.length === 0) return [];
    rootId = rootRes.data.files[0].id as string;
  } catch {
    return [];
  }

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: 100,
      pageToken,
    });
    const yearFolders = res.data.files || [];
    pageToken = res.data.nextPageToken;
    for (const yearFolder of yearFolders) {
      const monthRes: any = await drive.files.list({
        q: `'${yearFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id,name)",
      });
      const monthFolders = monthRes.data.files || [];
      for (const monthFolder of monthFolders) {
        let filePage: string | undefined = undefined;
        do {
          const fileRes: any = await drive.files.list({
            q: `'${monthFolder.id}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
            fields: "nextPageToken,files(id,name,size,createdTime)",
            pageSize: 100,
            pageToken: filePage,
          });
          const files = fileRes.data.files || [];
          allFiles.push(...files.map((f: any) => ({
            id: f.id,
            name: f.name,
            size: parseInt(f.size || "0"),
            createdTime: f.createdTime,
          })));
          filePage = fileRes.data.nextPageToken;
        } while (filePage);
      }
    }
  } while (pageToken);

  return allFiles;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

export function isGoogleDriveConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}
