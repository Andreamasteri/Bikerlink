/**
 * Test della logica pura del flusso permesso background ("Sempre").
 *
 * `resolveBackgroundPermission` incapsula la macchina a stati foreground-first
 * descritta nei commenti di location-context.tsx. I tre callback iniettati
 * (getForeground, requestForeground, requestBackground) sostituiscono le
 * chiamate expo-location reali, permettendo di esercitare ogni ramo senza
 * montare un provider React né toccare il bridge nativo.
 *
 * Rami testati:
 *   FG già concesso + BG granted              → "granted"
 *   FG già concesso + BG denied canAskAgain   → "denied"
 *   FG già concesso + BG denied !canAskAgain  → "needsSettings"
 *   FG negato !canAskAgain                    → "needsSettings" (senza chiedere)
 *   FG negato canAskAgain → richiesto, ancora negato canAskAgain   → "denied"
 *   FG negato canAskAgain → richiesto, ancora negato !canAskAgain  → "needsSettings"
 *   FG negato canAskAgain → richiesto, concesso; BG granted        → "granted"
 *   FG negato canAskAgain → richiesto, concesso; BG denied !canAsk → "needsSettings"
 */

import { describe, it, expect, vi } from "vitest";
import { resolveBackgroundPermission } from "@/lib/location-permission";
import type { PermResult } from "@/lib/location-permission";

function fg(status: string, canAskAgain: boolean): () => Promise<PermResult> {
  return () => Promise.resolve({ status, canAskAgain });
}

function bg(status: string, canAskAgain: boolean): () => Promise<PermResult> {
  return () => Promise.resolve({ status, canAskAgain });
}

describe("resolveBackgroundPermission — foreground già concesso", () => {
  const getFgGranted = fg("granted", true);
  const neverCalled = vi.fn();

  it("granted: BG concesso → 'granted'", async () => {
    const result = await resolveBackgroundPermission(
      getFgGranted,
      neverCalled,
      bg("granted", true),
    );
    expect(result).toBe("granted");
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("denied+canAskAgain: BG negato ma il dialog è ancora possibile → 'denied'", async () => {
    const result = await resolveBackgroundPermission(
      getFgGranted,
      neverCalled,
      bg("denied", true),
    );
    expect(result).toBe("denied");
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("denied+!canAskAgain: BG negato definitivamente (Android 11+ / revocato) → 'needsSettings'", async () => {
    const result = await resolveBackgroundPermission(
      getFgGranted,
      neverCalled,
      bg("denied", false),
    );
    expect(result).toBe("needsSettings");
    expect(neverCalled).not.toHaveBeenCalled();
  });
});

describe("resolveBackgroundPermission — foreground non concesso", () => {
  it("FG negato definitivamente (!canAskAgain) → 'needsSettings' senza richiedere nulla", async () => {
    const requestFg = vi.fn();
    const requestBg = vi.fn();
    const result = await resolveBackgroundPermission(
      fg("denied", false),
      requestFg,
      requestBg,
    );
    expect(result).toBe("needsSettings");
    expect(requestFg).not.toHaveBeenCalled();
    expect(requestBg).not.toHaveBeenCalled();
  });

  it("FG negato canAskAgain → richiesto, ancora negato ma canAskAgain → 'denied'", async () => {
    const requestBg = vi.fn();
    const result = await resolveBackgroundPermission(
      fg("denied", true),
      fg("denied", true),
      requestBg,
    );
    expect(result).toBe("denied");
    expect(requestBg).not.toHaveBeenCalled();
  });

  it("FG negato canAskAgain → richiesto, ancora negato !canAskAgain → 'needsSettings'", async () => {
    const requestBg = vi.fn();
    const result = await resolveBackgroundPermission(
      fg("denied", true),
      fg("denied", false),
      requestBg,
    );
    expect(result).toBe("needsSettings");
    expect(requestBg).not.toHaveBeenCalled();
  });

  it("FG negato canAskAgain → richiesto e concesso; BG concesso → 'granted'", async () => {
    const result = await resolveBackgroundPermission(
      fg("denied", true),
      fg("granted", true),
      bg("granted", true),
    );
    expect(result).toBe("granted");
  });

  it("FG negato canAskAgain → richiesto e concesso; BG negato !canAskAgain → 'needsSettings'", async () => {
    const result = await resolveBackgroundPermission(
      fg("denied", true),
      fg("granted", true),
      bg("denied", false),
    );
    expect(result).toBe("needsSettings");
  });

  it("FG negato canAskAgain → richiesto e concesso; BG negato canAskAgain → 'denied'", async () => {
    const result = await resolveBackgroundPermission(
      fg("denied", true),
      fg("granted", true),
      bg("denied", true),
    );
    expect(result).toBe("denied");
  });
});
