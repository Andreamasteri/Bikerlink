import { downloadBuffer, listObjects } from "./objectStorage";
import { EXPORT_OBJECT_PREFIX, type ExportMeta, type ExportSchedule, getScheduleIntervalMs, stopExportScheduler, getExportSchedule, runExport } from "./export-service";

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

export async function startExportScheduler(): Promise<void> {
  stopExportScheduler();
  const schedule = await getExportSchedule();
  const intervalMs = getScheduleIntervalMs(schedule);
  if (!intervalMs) return;

  const tick = async () => {
    await runScheduledExport();
  };

  const id = setInterval(tick, intervalMs);
  (id as NodeJS.Timeout).unref?.();
}
