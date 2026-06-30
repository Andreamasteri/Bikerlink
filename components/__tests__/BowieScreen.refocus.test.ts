/**
 * Test di mount-level per BowieScreen (app/(tabs)/bowie.tsx).
 *
 * Regressione target (Task #5216 — la chat di Bowie si rompe silenziosamente
 * se il tab viene aperto due volte di fila):
 *   Il tab navigator può tenere lo screen MONTATO. Con un semplice
 *   `useEffect([], [])` che imposta `visible=true`, dopo che l'utente chiude la
 *   chat (`visible=false` + router.back()) e ri-naviga al tab senza unmount,
 *   l'effect non si rilancia → `visible` resta false → chat invisibile.
 *
 * Il fix usa `useFocusEffect`: il callback gira a OGNI focus del tab. Questo
 * test mocka useFocusEffect per catturare il callback e poterlo richiamare a
 * mano, simulando i focus successivi (apri → chiudi → ri-apri).
 *
 * Strategia: monta con react-test-renderer (React reale), AssistantChatSheet
 * mockato a un componente che registra le prop `visible`/`onClose`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── Stato condiviso accessibile nelle factory vi.mock (hoistate) ─────────────
const fns = vi.hoisted(() => ({ back: vi.fn() }));
const focusCtrl = vi.hoisted(() => ({
  cb: null as null | (() => void | (() => void)),
}));
const sheet = vi.hoisted(() => ({
  visible: undefined as boolean | undefined,
  onClose: (() => {}) as () => void,
}));

vi.mock("react-native", () => ({ View: "View" }));

// useFocusEffect: NON eseguiamo subito il callback — lo memorizziamo così il
// test controlla quando avviene un "focus" (il vero hook lo esegue a ogni focus
// del tab; qui lo simuliamo esplicitamente con focus()).
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: fns.back }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    focusCtrl.cb = cb;
  },
}));

vi.mock("@/components/user/ai-assistant/AssistantChatSheet", () => ({
  default: (props: { visible: boolean; onClose: () => void }) => {
    sheet.visible = props.visible;
    sheet.onClose = props.onClose;
    return null;
  },
}));

import BowieScreen from "@/app/(tabs)/bowie";

function mount(): ReturnType<typeof renderer.create> {
  let comp!: ReturnType<typeof renderer.create>;
  renderer.act(() => {
    comp = renderer.create(React.createElement(BowieScreen));
  });
  return comp;
}

// Simula un evento di focus del tab (montaggio iniziale o ri-navigazione).
function focus(): void {
  renderer.act(() => {
    focusCtrl.cb?.();
  });
}

describe("BowieScreen — la chat torna visibile a ogni focus del tab", () => {
  beforeEach(() => {
    fns.back.mockClear();
    focusCtrl.cb = null;
    sheet.visible = undefined;
  });

  it("registra il callback di focus invece di un effect-on-mount", () => {
    mount();
    // Stato iniziale: nessun focus ancora processato → chat nascosta.
    expect(sheet.visible).toBe(false);
    // Il fix DEVE registrare un callback di focus (useFocusEffect), non un
    // semplice useEffect([]) che non si rilancia alla ri-navigazione.
    expect(focusCtrl.cb).toBeTypeOf("function");
  });

  it("apri → chiudi → ri-apri: la chat ridiventa visibile", () => {
    mount();

    // 1° focus (apertura del tab): la chat diventa visibile.
    focus();
    expect(sheet.visible).toBe(true);

    // L'utente chiude: visible=false e si torna indietro.
    renderer.act(() => {
      sheet.onClose();
    });
    expect(sheet.visible).toBe(false);
    expect(fns.back).toHaveBeenCalledTimes(1);

    // Ri-navigazione al tab senza unmount → 2° focus: la chat DEVE tornare
    // visibile (questa è la regressione che un useEffect([]) non coprirebbe).
    focus();
    expect(sheet.visible).toBe(true);
  });
});
