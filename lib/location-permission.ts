/**
 * Logica pura del flusso permesso background ("Sempre").
 *
 * Separata dal provider React così può essere testata senza montare un contesto
 * e senza dipendere dal modulo expo-location reale.
 *
 * Flusso:
 *  1. Controlla il foreground. Se NON concesso:
 *     - canAskAgain=false → needsSettings (il sistema non mostrerà più il dialog)
 *     - canAskAgain=true  → richiede il foreground. Se ancora non concesso → denied / needsSettings.
 *  2. Foreground ok → richiede il background.
 *     - granted                   → "granted"
 *     - denied, canAskAgain=true  → "denied" (può riprovare)
 *     - denied, canAskAgain=false → "needsSettings" (Android 11+ / revocato)
 */

import type { BackgroundPermissionResult } from "@/lib/location-context";

export interface PermResult {
  status: string;
  canAskAgain: boolean;
}

export async function resolveBackgroundPermission(
  getForeground: () => Promise<PermResult>,
  requestForeground: () => Promise<PermResult>,
  requestBackground: () => Promise<PermResult>,
): Promise<BackgroundPermissionResult> {
  let fg = await getForeground();

  if (fg.status !== "granted") {
    if (!fg.canAskAgain) {
      return "needsSettings";
    }
    fg = await requestForeground();
    if (fg.status !== "granted") {
      return fg.canAskAgain ? "denied" : "needsSettings";
    }
  }

  const bg = await requestBackground();
  if (bg.status === "granted") return "granted";
  return bg.canAskAgain ? "denied" : "needsSettings";
}
