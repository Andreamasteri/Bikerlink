/**
 * Test di mount-level per AssistantOnboardingTour.
 *
 * Componente sotto test: components/user/ai-assistant/AssistantOnboardingTour.tsx
 *   — il tour di onboarding di "Bowie" (overlay a schermo intero con card e
 *     bottoni Avanti/Indietro/X) mostrato una sola volta al primo boot.
 *
 * Strategia:
 *   Monta il componente tramite react-test-renderer (React reale, dipendenze
 *   native mockate). Per le assert sull'overlay VISIBILE si forza il 1° useState
 *   (`visible`) a true via vi.mock("react") — stessa tecnica di
 *   FloatingWidget.mount.test.ts — così non serve flushare l'IIFE async né i
 *   timer. Per il gating si lascia il flusso reale e si flushano i microtask.
 *
 * Regressione target (Task #4964 — bottoni bloccati su Android):
 *   - Rimuovere pointerEvents="box-none" dall'overlay → l'Animated.View con
 *     native driver intercetta i tap e i bottoni della card non rispondono.
 *   - Rimuovere/abbassare `elevation` sotto i fratelli flottanti (FloatingWidget
 *     elevation 12, UptimeWidget elevation 20) → su Android l'hit-testing
 *     preferisce i widget elevati e i bottoni del tour perdono il tocco.
 *   - Mostrare il tour anche con il flag già settato (boot successivi).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";

// ── Stato condiviso: accessibile nelle factory vi.mock (hoistate) ─────────────
const ctrl = vi.hoisted(() => ({
  // Se true, il 1° useState (visible) ritorna true al primo render
  forceVisible: false,
  // Contatore chiamate useState; azzerato prima di ogni mount
  callIdx: 0,
}));

const mocks = vi.hoisted(() => ({
  onboardingEnabled: true,
  alreadyShown: false,
}));

const fns = vi.hoisted(() => ({
  wasOnboardingShown: vi.fn(async () => mocks.alreadyShown),
  markOnboardingShown: vi.fn(async () => {}),
}));

// ── Mock: react — wrappa useState per controllare `visible` senza act() async ─
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  function wrappedUseState<S>(
    init: S | (() => S),
  ): [S, import("react").Dispatch<import("react").SetStateAction<S>>] {
    ctrl.callIdx++;
    const [val, setter] = (actual.useState as typeof React.useState)(init);
    if (ctrl.forceVisible && ctrl.callIdx === 1) {
      return [true as unknown as S, setter];
    }
    return [val, setter];
  }

  const mod = { ...actual, useState: wrappedUseState };
  return { ...mod, default: mod };
});

// ── Mock: react-native ────────────────────────────────────────────────────────
vi.mock("react-native", () => {
  class FakeAnimatedValue {
    constructor(public v: number) {}
  }
  return {
    StyleSheet: { create: (s: unknown) => s, absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } },
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    Animated: {
      View: "AnimatedView",
      Value: FakeAnimatedValue,
      timing: () => ({ start: (cb?: () => void) => { if (cb) cb(); } }),
    },
    // No-op: non programmiamo il callback, così non parte il setTimeout interno.
    InteractionManager: { runAfterInteractions: () => {} },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    surface: "#1a1a1a",
    primary: "#E53935",
    border: "#333",
    text: "#fff",
    textSecondary: "#888",
    textMuted: "#888",
  }),
}));

vi.mock("@/lib/language-context", () => ({
  useT: () => () => "",
}));

vi.mock("@/hooks/useAssistantEnabled", () => ({
  useAssistantEnabled: () => ({ onboardingEnabled: mocks.onboardingEnabled }),
}));

vi.mock("@/lib/ai-assistant/client-actions", () => ({
  wasOnboardingShown: fns.wasOnboardingShown,
  markOnboardingShown: fns.markOnboardingShown,
}));

vi.mock("@/lib/ai-assistant/telemetry-client", () => ({
  logAssistantClientEvent: () => {},
}));

import AssistantOnboardingTour from "@/components/user/ai-assistant/AssistantOnboardingTour";

// ── Helper: unisce uno style array in un oggetto piatto ───────────────────────
function flattenStyle(style: unknown): Record<string, unknown> {
  const arr = Array.isArray(style) ? style : [style];
  return Object.assign(
    {},
    ...(arr as unknown[]).filter((s) => s && typeof s === "object"),
  ) as Record<string, unknown>;
}

function mountSync(): ReturnType<typeof renderer.create> {
  ctrl.callIdx = 0;
  let comp!: ReturnType<typeof renderer.create>;
  renderer.act(() => {
    comp = renderer.create(React.createElement(AssistantOnboardingTour));
  });
  return comp;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// ── (a) Overlay visibile: regression guard touch Android ─────────────────────
describe("AssistantOnboardingTour — overlay tappabile su Android", () => {
  beforeEach(() => {
    mocks.onboardingEnabled = true;
    mocks.alreadyShown = true; // l'effect esce subito; `visible` è forzato dal wrap
    ctrl.forceVisible = true;
    fns.wasOnboardingShown.mockClear();
    fns.markOnboardingShown.mockClear();
  });

  it("(a1) l'overlay root è un AnimatedView con pointerEvents='box-none'", () => {
    const json = mountSync().toJSON() as { type: string; props: Record<string, unknown> } | null;
    expect(json).not.toBeNull();
    expect(json!.type).toBe("AnimatedView");
    expect(json!.props.pointerEvents).toBe("box-none");
  });

  it("(a2) l'overlay ha elevation > dei fratelli flottanti (FloatingWidget=12, UptimeWidget=20)", () => {
    const json = mountSync().toJSON() as { props: Record<string, unknown> };
    const style = flattenStyle(json.props.style);
    const elevation = style.elevation as number | undefined;
    expect(typeof elevation).toBe("number");
    expect((elevation ?? 0) > 20).toBe(true);
  });

  it("(a3) l'overlay mantiene zIndex alto (priorità su iOS)", () => {
    const json = mountSync().toJSON() as { props: Record<string, unknown> };
    const style = flattenStyle(json.props.style);
    expect((style.zIndex as number) >= 9999).toBe(true);
  });
});

// ── (b) Gating: non si mostra se già visto / se disabilitato ──────────────────
describe("AssistantOnboardingTour — gating del flag onboarding", () => {
  beforeEach(() => {
    ctrl.forceVisible = false;
    fns.wasOnboardingShown.mockClear();
    fns.markOnboardingShown.mockClear();
  });

  it("(b1) resta null se il flag è già settato (boot successivi)", async () => {
    mocks.onboardingEnabled = true;
    mocks.alreadyShown = true;
    let comp!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => {
      comp = renderer.create(React.createElement(AssistantOnboardingTour));
      await flushPromises();
    });
    expect(comp.toJSON()).toBeNull();
    expect(fns.wasOnboardingShown).toHaveBeenCalled();
    // Non deve marcare/mostrare nulla se già visto
    expect(fns.markOnboardingShown).not.toHaveBeenCalled();
  });

  it("(b2) resta null e NON legge il flag se l'onboarding è disabilitato", async () => {
    mocks.onboardingEnabled = false;
    mocks.alreadyShown = false;
    let comp!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => {
      comp = renderer.create(React.createElement(AssistantOnboardingTour));
      await flushPromises();
    });
    expect(comp.toJSON()).toBeNull();
    expect(fns.wasOnboardingShown).not.toHaveBeenCalled();
  });
});
