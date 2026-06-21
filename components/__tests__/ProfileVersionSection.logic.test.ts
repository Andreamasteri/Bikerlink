/**
 * Test della logica pura del footer versione nel profilo.
 *
 * Componente sotto test: components/profile/view/ProfileVersionSection.tsx
 *   — il footer che mostra la versione Build (apk.runtime.ota), l'OTA applicata
 *     e il badge "Admin OTA in test" visibile solo agli admin.
 *
 * Strategia:
 *   - Importa DIRETTAMENTE le funzioni pure esportate dal componente:
 *       parseAppVersion         → parsing della stringa versione da expo-constants
 *       computeLastApprovedOtaNum → estrazione numero OTA dall'ultima release "approved"
 *       computeShowAdminOta     → condizione di visibilità del badge admin
 *   - expo-constants è mockato per controllare il valore di expoConfig.version;
 *     le altre dipendenze native sono mockata al minimo per permettere il caricamento
 *     del modulo senza eseguire il corpo del componente.
 *
 * Copertura richiesta (Task #4665):
 *   (a) parseAppVersion — stringa 3 parti, 2 parti, malformata, vuota
 *   (b) computeShowAdminOta — badge mostrato (APPLIED > approved), nascosto (APPLIED ≤ approved),
 *       nascosto se uno dei due è null
 *   (c) computeLastApprovedOtaNum — estrazione da otaVersion, da message, nessuna release
 *       approved, releases undefined, release più recente vince sull'ordinamento
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze necessarie solo per caricare il modulo ──────────────────
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { version: "55.10.12" },
  },
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: {},
  Text: {},
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({}),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/constants/buildInfo", () => ({
  APPLIED_OTA_NUMBER: 128,
}));

vi.mock("@/lib/otaStorage", () => ({
  loadAppliedOtaNumber: vi.fn().mockResolvedValue(null),
  saveAppliedOtaNumber: vi.fn().mockResolvedValue(undefined),
}));

// ── import DIRETTO delle funzioni pure di produzione ─────────────────────────
import {
  parseAppVersion,
  computeLastApprovedOtaNum,
  computeShowAdminOta,
  type OtaReleaseSummary,
} from "@/components/profile/view/ProfileVersionSection";

// ── (a) parseAppVersion ───────────────────────────────────────────────────────
describe("parseAppVersion — (a) parsing stringa versione", () => {
  it("stringa a 3 parti restituisce i tre campi corretti", () => {
    expect(parseAppVersion("55.10.12")).toEqual({ apk: "55", runtime: "10", ota: "12" });
  });

  it("stringa a 3 parti con zeri funziona correttamente", () => {
    expect(parseAppVersion("1.0.0")).toEqual({ apk: "1", runtime: "0", ota: "0" });
  });

  it("stringa con più di 3 parti usa solo i primi tre segmenti", () => {
    const r = parseAppVersion("55.10.12.99");
    expect(r.apk).toBe("55");
    expect(r.runtime).toBe("10");
    expect(r.ota).toBe("12");
  });

  it("stringa a 2 parti restituisce ota con placeholder —", () => {
    expect(parseAppVersion("55.10")).toEqual({ apk: "55", runtime: "10", ota: "—" });
  });

  it("stringa a 1 parte (malformata) restituisce tutti i campi con placeholder —", () => {
    expect(parseAppVersion("55")).toEqual({ apk: "—", runtime: "—", ota: "—" });
  });

  it("stringa vuota restituisce tutti i campi con placeholder —", () => {
    expect(parseAppVersion("")).toEqual({ apk: "—", runtime: "—", ota: "—" });
  });

  it("senza argomento legge da expo-constants (mock: 55.10.12)", () => {
    expect(parseAppVersion()).toEqual({ apk: "55", runtime: "10", ota: "12" });
  });
});

// ── (b) computeShowAdminOta ───────────────────────────────────────────────────
describe("computeShowAdminOta — (b) visibilità badge Admin OTA in test", () => {
  it("APPLIED > approved → badge visibile (true)", () => {
    expect(computeShowAdminOta(10, 8)).toBe(true);
  });

  it("APPLIED === approved → badge nascosto (false)", () => {
    expect(computeShowAdminOta(10, 10)).toBe(false);
  });

  it("APPLIED < approved → badge nascosto (false)", () => {
    expect(computeShowAdminOta(8, 10)).toBe(false);
  });

  it("APPLIED è null → badge nascosto (false)", () => {
    expect(computeShowAdminOta(null, 10)).toBe(false);
  });

  it("lastApprovedOtaNum è null → badge nascosto (false)", () => {
    expect(computeShowAdminOta(10, null)).toBe(false);
  });

  it("entrambi null → badge nascosto (false)", () => {
    expect(computeShowAdminOta(null, null)).toBe(false);
  });

  it("APPLIED = 1, approved = 0 → badge visibile (true)", () => {
    expect(computeShowAdminOta(1, 0)).toBe(true);
  });
});

// ── (c) computeLastApprovedOtaNum ─────────────────────────────────────────────
describe("computeLastApprovedOtaNum — (c) estrazione numero OTA dall'ultima release approved", () => {
  const makeRelease = (
    status: string,
    otaVersion: string | null,
    publishedAt: string,
    message?: string | null
  ): OtaReleaseSummary => ({ status, otaVersion, publishedAt, message });

  it("releases undefined → null", () => {
    expect(computeLastApprovedOtaNum(undefined)).toBeNull();
  });

  it("array vuoto → null", () => {
    expect(computeLastApprovedOtaNum([])).toBeNull();
  });

  it("solo release non-approved → null", () => {
    const releases = [makeRelease("pending", "55.10.3", "2026-06-01T00:00:00Z")];
    expect(computeLastApprovedOtaNum(releases)).toBeNull();
  });

  it("estrae il numero OTA dal campo otaVersion (3° segmento)", () => {
    const releases = [makeRelease("approved", "55.10.7", "2026-06-10T00:00:00Z")];
    expect(computeLastApprovedOtaNum(releases)).toBe(7);
  });

  it("estrae il numero OTA dal campo message se otaVersion è null", () => {
    const releases = [
      makeRelease("approved", null, "2026-06-10T00:00:00Z", "[OTA:55.10.9] Fix crash GPS"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBe(9);
  });

  it("otaVersion ha priorità su message quando entrambi sono presenti", () => {
    const releases = [
      makeRelease("approved", "55.10.7", "2026-06-10T00:00:00Z", "[OTA:55.10.99] altro"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBe(7);
  });

  it("quando né otaVersion né message corrispondono → null", () => {
    const releases = [makeRelease("approved", "versione-malformata", "2026-06-10T00:00:00Z", null)];
    expect(computeLastApprovedOtaNum(releases)).toBeNull();
  });

  it("tra più release approved vince la più recente per publishedAt", () => {
    const releases = [
      makeRelease("approved", "55.10.5", "2026-06-01T00:00:00Z"),
      makeRelease("approved", "55.10.9", "2026-06-20T00:00:00Z"),
      makeRelease("approved", "55.10.7", "2026-06-10T00:00:00Z"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBe(9);
  });

  it("release pending/rejected ignorate anche se più recenti", () => {
    const releases = [
      makeRelease("approved", "55.10.5", "2026-06-01T00:00:00Z"),
      makeRelease("pending", "55.10.9", "2026-06-20T00:00:00Z"),
      makeRelease("rejected", "55.10.8", "2026-06-15T00:00:00Z"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBe(5);
  });

  it("otaVersion deve essere nel formato esatto X.Y.Z (no varianti)", () => {
    const releases = [
      makeRelease("approved", "v55.10.7", "2026-06-10T00:00:00Z"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBeNull();
  });

  it("il prefisso [OTA:X.Y.Z] nel message deve essere in prima posizione", () => {
    const releases = [
      makeRelease("approved", null, "2026-06-10T00:00:00Z", "Testo [OTA:55.10.9] fuori posto"),
    ];
    expect(computeLastApprovedOtaNum(releases)).toBeNull();
  });
});
