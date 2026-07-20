// Task #932 — single source of truth for the synthetic crash signal ID.
// Used by CrashBreakdownCard (hasPending check) and system-health (onAnalyzeCrash),
// so both always produce the same string from the same CrashGroup.
export function syntheticCrashSignalId(group: {
  crashType: string;
  errorSummary: string | null;
}): string {
  const normalized = (group.errorSummary ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 36);
  return `app.crash.${group.crashType}.${normalized}`;
}
