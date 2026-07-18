/**
 * Task #606 — Confirm old 'quebracho' chat sessions are not silently shown
 * with a blank label to the user.
 *
 * Covers two layers:
 *
 * 1. Unit tests on the helpers (`normalizePersonaId`, `rosterPersonaName`,
 *    `personaColor`-equivalent) — verifies the normalization contract in
 *    isolation without any component mount.
 *
 * 2. Render test for AssistantChatSheet — mounts the real component with a
 *    message that already carries `persona: { id: "quebracho", name: "Quebracho" }`
 *    in state (simulating an old session loaded from DB) and asserts:
 *      - the component does NOT throw;
 *      - the persona label Text node is present and non-empty.
 *
 * Regressione target:
 *   normalizePersonaId() è chiamato solo durante la gestione degli SSE (evento
 *   "persona"/"done"). Un record storico DB con `persona.id = "quebracho"`
 *   che raggiunge direttamente il render (state iniettato) deve essere
 *   gestito senza crash e senza etichetta vuota.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import renderer, { act } from "react-test-renderer";

// ── Hoisted shared state ───────────────────────────────────────────────────────
const stateCtrl = vi.hoisted(() => ({
  // Index of the useState call that should be overridden with injectedMessages
  injectOnCall: 1, // 1st useState = messages
  injectedMessages: [] as unknown[],
  callIdx: 0,
}));

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  function wrappedUseState<S>(
    init: S | (() => S),
  ): [S, import("react").Dispatch<import("react").SetStateAction<S>>] {
    stateCtrl.callIdx++;
    const [val, setter] = (actual.useState as typeof React.useState)(init);
    if (
      stateCtrl.callIdx === stateCtrl.injectOnCall &&
      stateCtrl.injectedMessages.length > 0
    ) {
      return [stateCtrl.injectedMessages as unknown as S, setter];
    }
    return [val, setter];
  }

  return { ...actual, useState: wrappedUseState, default: actual };
});

vi.mock("react-native", () => ({
  Modal: ({ children, visible }: { children: unknown; visible: boolean }) =>
    visible ? children : null,
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  FlatList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (arg: { item: unknown }) => unknown;
  }) =>
    React.createElement(
      "View",
      null,
      ...data.map((item, i) =>
        React.createElement("View", { key: i }, renderItem({ item }) as React.ReactNode),
      ),
    ),
  StyleSheet: {
    create: (s: Record<string, unknown>) => s,
    hairlineWidth: 1,
  },
  ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "android" },
}));

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: "KeyboardAvoidingView",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    surface: "#f0f0f0",
    primary: "#0000ff",
    text: "#000",
    textSecondary: "#666",
    textMuted: "#999",
    border: "#ddd",
    success: "#00cc00",
    warning: "#ffaa00",
    accent: "#aa00ff",
  }),
}));

vi.mock("@/lib/language-context", () => ({
  useT: () => (key: string) => key,
  useLanguage: () => ({ language: "it", setLanguage: vi.fn() }),
}));

vi.mock("@/lib/query-client", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/ai-assistant/sse-client", () => ({
  streamAssistantMessage: vi.fn(),
}));

vi.mock("@/lib/ai-assistant/friendly-error", () => ({
  friendlyChatErrorMessage: vi.fn(() => ""),
  friendlyChatErrorFromEvent: vi.fn(() => ""),
}));

vi.mock("@/hooks/useAssistantConfig", () => ({
  currentAssistantPlatform: () => "android",
}));

vi.mock("@/hooks/useAssistantRoster", () => ({
  useAssistantRoster: () => ({ personas: [] }),
}));

vi.mock("@/lib/ai-assistant/client-actions", () => ({
  executeClientAction: vi.fn(),
}));

vi.mock("@shared/bowie-greeting", () => ({
  BOWIE_INTRO_POEM: "Ciao, sono Bowie.",
}));

vi.mock("@/components/user/ai-assistant/AssistantActionConfirmSheet", () => ({
  default: () => null,
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import {
  normalizePersonaId,
  rosterPersonaName,
  KNOWN_ASSISTANT_PERSONAS,
} from "@/lib/ai-assistant/roster";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

// ── Helpers ────────────────────────────────────────────────────────────────────

function textOf(node: { props: { children?: unknown } }): string {
  const c = node.props.children;
  if (Array.isArray(c)) return c.map((x: unknown) => String(x ?? "")).join("");
  return String(c ?? "");
}

// ── Unit tests: helpers ────────────────────────────────────────────────────────

describe("normalizePersonaId — quebracho mapping", () => {
  it('maps "quebracho" to "bowie"', () => {
    expect(normalizePersonaId("quebracho")).toBe("bowie");
  });

  it('maps every other unknown ID to "bowie"', () => {
    expect(normalizePersonaId("unknown-agent")).toBe("bowie");
    expect(normalizePersonaId("")).toBe("bowie");
    expect(normalizePersonaId("legacy-bot")).toBe("bowie");
  });

  it("passes known IDs through unchanged", () => {
    expect(normalizePersonaId("bowie")).toBe("bowie");
    expect(normalizePersonaId("horus")).toBe("horus");
    expect(normalizePersonaId("ares")).toBe("ares");
  });
});

describe("rosterPersonaName — quebracho via normalization", () => {
  it('resolves "quebracho" → normalize → "bowie" → "Bowie"', () => {
    const normalized = normalizePersonaId("quebracho");
    // After normalization the id is "bowie"; the roster name lookup returns "Bowie"
    expect(rosterPersonaName(KNOWN_ASSISTANT_PERSONAS, normalized)).toBe("Bowie");
  });

  it("returns non-empty fallback even for un-normalized quebracho id", () => {
    // Direct call without normalization: falls back to the fallbackName arg
    const label = rosterPersonaName([], "quebracho", "Quebracho");
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns ultimate fallback 'Bowie' when roster empty and no fallbackName", () => {
    const label = rosterPersonaName([], "quebracho");
    expect(label).toBe("Bowie");
  });
});

// ── Render test: AssistantChatSheet with a quebracho message in state ──────────
//
// The quebracho message id drives the testID: `persona-label-msg-legacy-1`
// (added in Task #606 to AssistantChatSheet.tsx). We assert:
//  - The node exists (label IS rendered — not omitted/blank)
//  - Its text is "Quebracho" (the fallbackName from the stored persona.name,
//    since "quebracho" is not in KNOWN_ASSISTANT_PERSONAS; rosterPersonaName
//    returns fallbackName rather than an empty string, so the label is
//    always non-blank even for unknown IDs)
//
// This test would FAIL if:
//  - personaColor throws for unknown id (component never finishes rendering)
//  - The `item.role === "assistant" && item.persona` guard is accidentally
//    removed, hiding the label entirely
//  - rosterPersonaName starts returning "" for unknown IDs

describe("AssistantChatSheet — render with legacy quebracho persona message", () => {
  let comp: ReturnType<typeof renderer.create> | null = null;

  const LEGACY_MSG_ID = "msg-legacy-1";

  const quebranchoMessage = {
    id: LEGACY_MSG_ID,
    role: "assistant" as const,
    content: "Sono Quebracho.",
    createdAt: 1_700_000_000_000,
    persona: { id: "quebracho", name: "Quebracho" },
  };

  beforeEach(() => {
    stateCtrl.callIdx = 0;
    stateCtrl.injectOnCall = 1;
    stateCtrl.injectedMessages = [quebranchoMessage];
  });

  afterEach(async () => {
    if (comp) {
      await act(async () => {
        comp!.unmount();
      });
      comp = null;
    }
    stateCtrl.injectedMessages = [];
    stateCtrl.callIdx = 0;
  });

  it("mounts without throwing when a message carries persona.id='quebracho'", () => {
    expect(() => {
      act(() => {
        comp = renderer.create(
          React.createElement(AssistantChatSheet, { visible: true, onClose: vi.fn() }),
        );
      });
    }).not.toThrow();
  });

  it("renders the persona label node for the quebracho message (testID present)", () => {
    act(() => {
      comp = renderer.create(
        React.createElement(AssistantChatSheet, { visible: true, onClose: vi.fn() }),
      );
    });

    // Target exactly the persona label for this message via testID.
    const labelNodes = comp!.root.findAll(
      (n) => n.props.testID === `persona-label-${LEGACY_MSG_ID}`,
    );

    // The label must be rendered (guard `item.role === "assistant" && item.persona`)
    expect(labelNodes).toHaveLength(1);
  });

  it("persona label text is non-blank ('Quebracho' — rosterPersonaName fallback)", () => {
    act(() => {
      comp = renderer.create(
        React.createElement(AssistantChatSheet, { visible: true, onClose: vi.fn() }),
      );
    });

    const labelNode = comp!.root.findAll(
      (n) => n.props.testID === `persona-label-${LEGACY_MSG_ID}`,
    )[0];

    expect(labelNode).toBeDefined();

    // rosterPersonaName([], "quebracho", "Quebracho") → "Quebracho"
    // (unknown ID → fallback to persona.name; never blank)
    const labelText = textOf(labelNode);
    expect(labelText.trim()).not.toBe("");
    expect(labelText).toBe("Quebracho");
  });

  it("personaColor returns the accent fallback for 'quebracho' — no color-lookup crash", () => {
    // Verifies that the style prop on the label node carries a truthy color
    // (colors.accent from the useColors mock = "#aa00ff") instead of undefined
    // or an exception from the personaColor switch.
    act(() => {
      comp = renderer.create(
        React.createElement(AssistantChatSheet, { visible: true, onClose: vi.fn() }),
      );
    });

    const labelNode = comp!.root.findAll(
      (n) => n.props.testID === `persona-label-${LEGACY_MSG_ID}`,
    )[0];

    expect(labelNode).toBeDefined();

    // style is an array: [styles.personaLabel, { color: <computed> }]
    const styleArr: Array<Record<string, unknown>> = labelNode.props.style ?? [];
    const colorStyle = styleArr.find((s) => typeof s === "object" && "color" in s);
    expect(colorStyle).toBeDefined();
    expect(colorStyle!.color).toBe("#aa00ff"); // accent — the quebracho fallback
  });
});
