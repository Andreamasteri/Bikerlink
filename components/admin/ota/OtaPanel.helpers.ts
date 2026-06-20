export interface OtaRelease {
  id: string;
  easUpdateId: string;
  easGroupId: string | null;
  channel: string;
  runtimeVersion: string | null;
  message: string | null;
  otaVersion: string | null;
  status: "pending" | "approved" | "rejected";
  publishedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  bootSuccessCount: number;
  bootFailureCount: number;
  downloadCount: number;
  autoRollbackEnabled: boolean;
  autoRollbackThreshold: number;
  autoRollbackMinDownloads: number;
  autoRollbackWindowMinutes: number;
  autoRolledBackAt: string | null;
}

export function extractOtaNumber(release: OtaRelease, fallbackIndex: number): string {
  if (release.otaVersion) {
    const triplet = release.otaVersion.match(/^\d+\.\d+\.(\d+)$/);
    if (triplet) return triplet[1];
    const legacy = release.otaVersion.match(/OTA-?(\d+)/i);
    if (legacy) return legacy[1];
  }
  return String(fallbackIndex);
}

export function getStatusColor(status: string, colors: { success: string; error: string; accent: string; textSecondary: string }): string {
  if (status === "approved") return colors.success;
  if (status === "rejected") return colors.error;
  return colors.accent;
}

export function getStatusLabel(status: string): string {
  if (status === "approved") return "Approvata ✓";
  if (status === "rejected") return "Rifiutata ✗";
  return "In attesa";
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

export function bootSuccessRate(r: OtaRelease): number | null {
  if (r.downloadCount <= 0) return null;
  return Math.round((r.bootSuccessCount / r.downloadCount) * 100);
}
