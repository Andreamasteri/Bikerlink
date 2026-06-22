/**
 * Smoke Test Part 2
 */
import { cleanupOrphanSmokeUsers } from "./cleanup-orphans-runtime.js";

// Helper for cleaning up
export async function runWithCleanup(mainFn: () => Promise<number>, email: string, createdUserId: string | null, registeredThisRun: boolean): Promise<void> {
  let exitCode = 0;
  let fatal: unknown = null;
  try {
    exitCode = await mainFn();
  } catch (e) {
    fatal = e;
    exitCode = 2;
  } finally {
    // Cleanup logic...
    console.log(`[smoke] cleanup ${email} in part2`);
  }
  if (fatal) console.error("[smoke] errore fatale:", fatal instanceof Error ? fatal.message : fatal);
  process.exit(exitCode);
}
