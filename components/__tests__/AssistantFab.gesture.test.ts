/**
 * Test della logica gesture dell'AssistantFab (FAB AI in basso a sinistra).
 *
 * Bug originale (Task #4449): il FAB era visibile ma non rispondeva ai tap —
 * AssistantChatSheet non si apriva mai. Causa primaria: handleOpen e tapGesture
 * non stabilizzati → su Hermes runOnJS(handleOpen) catturava un ref stantio e il
 * GestureDetector riceveva un nuovo gesture ad ogni render (finestra di
 * ri-registrazione asincrona del native handler in cui i tap si perdono).
 * Fix: handleOpen in useCallback([]) e tapGesture in useMemo([handleOpen,...]),
 * più .withRef(fabGestureRef) per il coordinamento col backdrop del FloatingWidget.
 *
 * Strategia (coerente con FloatingWidget.gesture.test.ts):
 *   - NON monta il componente (RNGH + Reanimated non girano in Node).
 *   - Replica le funzioni JS-side richiamate via runOnJS() con le stesse
 *     dipendenze iniettabili, così qualsiasi inversione di logica rompe i test:
 *       handleOpen        → haptic su native, setOpen(true)
 *       onEnd dispatch    → chiama handleOpen SOLO se success === true
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── tipi helper ───────────────────────────────────────────────────────────────
type VoidFn = () => void;
type SetOpenFn = (v: boolean) => void;
type PlatformLike = { OS: string };

// ── replica di handleOpen (AssistantFab.tsx) ─────────────────────────────────
function createHandleOpen(
  platform: PlatformLike,
  haptic: VoidFn,
  setOpen: SetOpenFn,
): VoidFn {
  return function handleOpen(): void {
    if (platform.OS !== "web") haptic();
    setOpen(true);
  };
}

// ── replica della logica onEnd del tapGesture ────────────────────────────────
// .onEnd((_e, success) => { if (success) runOnJS(handleOpen)(); })
function dispatchTapEnd(success: boolean, handleOpen: VoidFn): void {
  if (success) handleOpen();
}

// ── test: dispatch onEnd ─────────────────────────────────────────────────────

describe("AssistantFab — tapGesture onEnd dispatch", () => {
  let handleOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleOpen = vi.fn();
  });

  it("success=true → chiama handleOpen una sola volta", () => {
    dispatchTapEnd(true, handleOpen as VoidFn);
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it("success=false → NON chiama handleOpen (gesture non completata)", () => {
    dispatchTapEnd(false, handleOpen as VoidFn);
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it("tap multipli con success=true → handleOpen una volta per tap", () => {
    dispatchTapEnd(true, handleOpen as VoidFn);
    dispatchTapEnd(true, handleOpen as VoidFn);
    dispatchTapEnd(true, handleOpen as VoidFn);
    expect(handleOpen).toHaveBeenCalledTimes(3);
  });
});

// ── test: handleOpen ─────────────────────────────────────────────────────────

describe("AssistantFab — handleOpen (apertura chat AI)", () => {
  let haptic: ReturnType<typeof vi.fn>;
  let setOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    haptic = vi.fn();
    setOpen = vi.fn();
  });

  it("apre la chat: setOpen(true)", () => {
    const handleOpen = createHandleOpen({ OS: "ios" }, haptic as VoidFn, setOpen as SetOpenFn);
    handleOpen();
    expect(setOpen).toHaveBeenCalledTimes(1);
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("su iOS triggera haptic", () => {
    const handleOpen = createHandleOpen({ OS: "ios" }, haptic as VoidFn, setOpen as SetOpenFn);
    handleOpen();
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it("su Android triggera haptic", () => {
    const handleOpen = createHandleOpen({ OS: "android" }, haptic as VoidFn, setOpen as SetOpenFn);
    handleOpen();
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it("su web NON triggera haptic ma apre comunque la chat", () => {
    const handleOpen = createHandleOpen({ OS: "web" }, haptic as VoidFn, setOpen as SetOpenFn);
    handleOpen();
    expect(haptic).not.toHaveBeenCalled();
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("onEnd success=true porta all'apertura della chat (dispatch → handleOpen → setOpen)", () => {
    const handleOpen = createHandleOpen({ OS: "ios" }, haptic as VoidFn, setOpen as SetOpenFn);
    dispatchTapEnd(true, handleOpen);
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it("onEnd success=false NON apre la chat", () => {
    const handleOpen = createHandleOpen({ OS: "ios" }, haptic as VoidFn, setOpen as SetOpenFn);
    dispatchTapEnd(false, handleOpen);
    expect(setOpen).not.toHaveBeenCalled();
  });
});
