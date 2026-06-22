import { downloadBuffer, listObjects } from "./objectStorage";
import { EXPORT_OBJECT_PREFIX, type ExportMeta, runExport } from "./export-service";

export async function downloadExport(fileName: string): Promise<Buffer> {
  const objectPath = `${EXPORT_OBJECT_PREFIX}/${fileName}`;
  return downloadBuffer(objectPath);
}

export async function listExportFiles() {
  return listObjects(EXPORT_OBJECT_PREFIX + "/");
}

export async function runScheduledExport(): Promise<void> {
  try {
    await runExport({});
  } catch (err) {
    console.error("[export-service] scheduled export failed:", err);
  }
}
