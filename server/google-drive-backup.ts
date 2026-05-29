import { ReplitConnectors } from "@replit/connectors-sdk";

const FOLDER_NAME = "BikerLink — Database Backups";
const MAX_FILES_PER_TYPE = 7;

async function getConnectors(): Promise<ReplitConnectors> {
  return new ReplitConnectors();
}

async function findOrCreateFolder(connectors: ReplitConnectors): Promise<string> {
  const searchRes = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=name%3D'${encodeURIComponent(FOLDER_NAME)}'%20and%20mimeType%3D'application%2Fvnd.google-apps.folder'%20and%20trashed%3Dfalse&fields=files(id%2Cname)`,
    { method: "GET" }
  );
  const searchData = await searchRes.json() as { files?: { id: string; name: string }[] };

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await connectors.proxy("google-drive", "/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const created = await createRes.json() as { id: string };
  console.log(`[gdrive-backup] Cartella creata: ${FOLDER_NAME} (${created.id})`);
  return created.id;
}

async function pruneOldFiles(connectors: ReplitConnectors, folderId: string, prefix: string): Promise<void> {
  try {
    const q = encodeURIComponent(
      `'${folderId}' in parents and name contains '${prefix}' and trashed=false`
    );
    const listRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${q}&orderBy=createdTime&fields=files(id%2Cname%2CcreatedTime)`,
      { method: "GET" }
    );
    const listData = await listRes.json() as { files?: { id: string; name: string; createdTime: string }[] };
    const files = listData.files ?? [];

    if (files.length > MAX_FILES_PER_TYPE) {
      const toDelete = files.slice(0, files.length - MAX_FILES_PER_TYPE);
      for (const f of toDelete) {
        await connectors.proxy("google-drive", `/drive/v3/files/${f.id}`, { method: "DELETE" });
        console.log(`[gdrive-backup] Eliminato vecchio backup: ${f.name}`);
      }
    }
  } catch (err) {
    console.warn("[gdrive-backup] Pruning fallito (non bloccante):", err);
  }
}

export async function uploadBackupToGDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string; webViewLink: string }> {
  const connectors = await getConnectors();
  const folderId = await findOrCreateFolder(connectors);

  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = "bikerlink_backup_boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await connectors.proxy(
    "google-drive",
    `/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  const uploaded = await uploadRes.json() as { id: string; webViewLink: string };

  const prefix = fileName.startsWith("bikerlink_db") ? "bikerlink_db" : "bikerlink_media";
  await pruneOldFiles(connectors, folderId, prefix);

  console.log(`[gdrive-backup] Caricato su GDrive: ${fileName} → ${uploaded.webViewLink}`);
  return { fileId: uploaded.id, webViewLink: uploaded.webViewLink };
}
