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

/**
 * Logica pura del ciclo di revoca del permesso background.
 *
 * Rispecchia esattamente la logica di `checkBackgroundPermission` nel provider:
 *   - se il permesso era stato concesso (hadPermission=true) e ora NON lo è → revoked=true
 *   - se il permesso è ancora concesso → revoked=false, nextHadPermission=true
 *   - se il permesso non era mai stato concesso → revoked=false (invariato)
 *
 * Restituisce il nuovo stato (immutabile) senza dipendere da useState/useRef,
 * così può essere testata senza montare nessun componente React.
 */
export interface BackgroundRevocationResult {
  granted: boolean;
  revoked: boolean;
  nextHadPermission: boolean;
}

export function evaluateBackgroundRevocation(
  status: string,
  hadPermission: boolean,
): BackgroundRevocationResult {
  const granted = status === "granted";
  if (hadPermission && !granted) {
    return { granted, revoked: true, nextHadPermission: hadPermission };
  }
  if (granted) {
    return { granted, revoked: false, nextHadPermission: true };
  }
  return { granted, revoked: false, nextHadPermission: hadPermission };
}
