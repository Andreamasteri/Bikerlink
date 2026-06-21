/**
 * Test del path "modulo nativo assente" in optimizeImageForUpload.
 *
 * Funzione sotto test: lib/image-picker-utils.ts → optimizeImageForUpload()
 *
 * Quando `requireOptionalNativeModule("ExpoImageManipulator")` ritorna null
 * (il modulo nativo non è nel binario installato — tipicamente un APK compilato
 * prima che la dipendenza fosse aggiunta, aggiornato via OTA), la funzione:
 *   1. Salta ImageManipulator.manipulateAsync (non lancia "Cannot find native
 *      module" → non crasha l'app).
 *   2. Emette `sendStartupBeacon("img_manipulate_skipped_no_native")`.
 *   3. Registra `markAsyncError("native_module_missing", ...)` UNA SOLA VOLTA
 *      per sessione (flag module-level `nativeModuleMissingLogged`).
 *   4. Ritorna l'URI originale come fallback (nessuna perdita di dati).
 *
 * Nota architetturale: `nativeModuleMissingLogged` è un flag module-level che
 * persiste per tutta la vita del processo. Il modulo viene caricato UNA SOLA
 * VOLTA da vitest: la prima chiamata a optimizeImageForUpload nella suite lo
 * imposta a true. I test successivi vedono già il flag a true — questo è il
 * comportamento di produzione che vogliamo verificare (one-shot).
 *
 * Comportamenti verificati (regression guard diretto):
 *   (a) Prima chiamata: markAsyncError("native_module_missing") emesso una
 *       volta, con errore che menziona ExpoImageManipulator, e URI originale
 *       restituito come fallback.
 *   (b) Chiamate successive nella stessa sessione: markAsyncError NON ripetuto
 *       (one-shot, nativeModuleMissingLogged=true), URI restituito ugualmente.
 *   (c) sendStartupBeacon("img_manipulate_skipped_no_native") emesso ad ogni
 *       chiamata (il beacon non è one-shot, solo il log diagnostico lo è).
 *   (d) ImageManipulator.manipulateAsync mai chiamato nel path degradato.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted: riferimento alle funzioni mock prima delle factory ───────────────
const mockMarkAsyncError = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSendStartupBeacon = vi.hoisted(() => vi.fn());

// ── mock: expo-modules-core — requireOptionalNativeModule ritorna null ─────────
// (nessun modulo nativo ExpoImageManipulator nel binario installato)
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: vi.fn().mockReturnValue(null),
}));

// ── mock: crash-logger + startup-beacon ──────────────────────────────────────
vi.mock("@/lib/crash-logger", () => ({
  markAsyncError: mockMarkAsyncError,
}));

vi.mock("@/lib/startup-beacon", () => ({
  sendStartupBeacon: mockSendStartupBeacon,
}));

// ── mock: expo-image-picker (non usato da optimizeImageForUpload) ─────────────
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  getCameraPermissionsAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

// ── mock: expo-image-manipulator (non deve essere chiamato nel path degradato) ─
const mockManipulateAsync = vi.hoisted(() => vi.fn());
vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: mockManipulateAsync,
  SaveFormat: { JPEG: "jpeg" },
}));

// ── mock: expo-file-system (File viene importato nel modulo) ──────────────────
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

// ── mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Alert: { alert: vi.fn() },
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
}));

// ── import funzione dopo i mock ───────────────────────────────────────────────
import { optimizeImageForUpload } from "@/lib/image-picker-utils";

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockMarkAsyncError.mockClear();
  mockSendStartupBeacon.mockClear();
  mockManipulateAsync.mockClear();
});

// ── (a) Prima chiamata nella suite: one-shot log + URI fallback ───────────────
//
// Il flag nativeModuleMissingLogged inizia a false al primo caricamento del
// modulo. Questa prima chiamata lo porta a true e deve emettere esattamente
// un markAsyncError("native_module_missing") con l'errore che menziona il
// modulo mancante. L'URI originale deve essere restituito come fallback.
describe("optimizeImageForUpload — (a) prima chiamata: one-shot log + URI fallback", () => {
  it("emette una sola volta native_module_missing, con errore Error che menziona ExpoImageManipulator, e ritorna l'URI originale", async () => {
    const uri = "file:///test/image1.jpg";
    const result = await optimizeImageForUpload(uri);

    // Verifica URI fallback
    expect(result).toBe(uri);

    // Verifica one-shot log
    const logCalls = (mockMarkAsyncError.mock.calls as unknown[][]).filter(
      (call) => call[0] === "native_module_missing",
    );
    expect(logCalls.length).toBe(1);

    // Verifica payload errore
    const err = logCalls[0]?.[1] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/ExpoImageManipulator/i);
  });
});

// ── (b) Chiamate successive: nativeModuleMissingLogged=true blocca i log ──────
//
// Il flag è ora true (impostato dal test (a)). Tutte le chiamate successive
// nella stessa sessione devono restituire l'URI fallback senza emettere altri
// markAsyncError("native_module_missing").
describe("optimizeImageForUpload — (b) chiamate successive: one-shot garantito", () => {
  it("nessun markAsyncError('native_module_missing') nelle chiamate dopo la prima", async () => {
    // nativeModuleMissingLogged è già true: markAsyncError non deve essere chiamato
    await optimizeImageForUpload("file:///test/b1.jpg");
    await optimizeImageForUpload("file:///test/b2.jpg");

    const logCalls = (mockMarkAsyncError.mock.calls as unknown[][]).filter(
      (call) => call[0] === "native_module_missing",
    );
    expect(logCalls.length).toBe(0);
  });

  it("l'URI originale viene restituito anche nelle chiamate successive", async () => {
    const uri = "file:///test/fallback.jpg";
    const result = await optimizeImageForUpload(uri);
    expect(result).toBe(uri);
  });

  it("URI con dimensions opzionali: fallback corretto", async () => {
    const uri = "file:///test/hd.jpg";
    const result = await optimizeImageForUpload(uri, { width: 1920, height: 1080 });
    expect(result).toBe(uri);
  });
});

// ── (c) sendStartupBeacon emesso per ogni chiamata (non one-shot) ─────────────
describe("optimizeImageForUpload — (c) beacon 'img_manipulate_skipped_no_native' ad ogni chiamata", () => {
  it("il beacon viene emesso ad ogni chiamata, non solo alla prima", async () => {
    await optimizeImageForUpload("file:///test/x.jpg");
    await optimizeImageForUpload("file:///test/y.jpg");

    const beaconCalls = (mockSendStartupBeacon.mock.calls as unknown[][]).filter(
      (call) => call[0] === "img_manipulate_skipped_no_native",
    );
    // Il beacon non è protetto dal flag one-shot → deve arrivare per ogni chiamata
    expect(beaconCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ── (d) ImageManipulator.manipulateAsync mai chiamato nel path degradato ──────
describe("optimizeImageForUpload — (d) manipulateAsync NON invocato quando il modulo è assente", () => {
  it("manipulateAsync non viene mai chiamato nel path senza modulo nativo", async () => {
    await optimizeImageForUpload("file:///test/noop.jpg");
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });
});
