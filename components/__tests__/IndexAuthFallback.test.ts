/**
 * Test del fallback di avvio di app/index.tsx.
 *
 * CONTRATTO (anti-blocco spinner): se il bootstrap auth fallisce (rete/server,
 * es. /api/auth/me in timeout) e NON c'è un utente in cache, la schermata
 * iniziale NON deve restare sullo spinner. Deve mostrare un fallback leggibile
 * con un pulsante "Riprova" (testID `auth-retry-button`) il cui onPress chiama
 * `retryAuth`.
 *
 * Stati verificati:
 *  - authIsLoading=true → spinner (ActivityIndicator), nessun pulsante.
 *  - authFailed && !isAuthenticated → fallback con `auth-retry-button` (no spinner),
 *    e onPress invoca retryAuth.
 *  - isAuthenticated → Redirect verso le tabs (no spinner, no fallback).
 *
 * Strategia: montaggio con react-test-renderer (React reale in Node). useAuth,
 * react-native, expo-router, AsyncStorage e le costanti sono mockati così
 * l'import di app/index.tsx non trascina dipendenze native.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: useAuth (stato auth configurabile per test) ────────────────────────
const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  hadPreviousSession: false,
  authFailed: false,
  retryAuth: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));

// ── mock: react-native primitives ────────────────────────────────────────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

// ── mock: expo-router (Redirect inerte, tracciabile) ─────────────────────────
const Redirect = vi.hoisted(() => vi.fn((_props: { href: string }) => null));
vi.mock("expo-router", () => ({ Redirect }));

// ── mock: AsyncStorage + costanti ────────────────────────────────────────────
const getItem = vi.hoisted(() => vi.fn());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem },
}));
vi.mock("@/constants/onboarding", () => ({ ONBOARDING_STORAGE_KEY: "@onboarding" }));
vi.mock("@/constants/colors", () => ({
  default: {
    accent: "#E53935",
    background: "#000",
    text: "#FFF",
    textSecondary: "#AAA",
  },
}));

import Index from "@/app/index";

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Index));
  });
  // Lascia risolvere il getItem(ONBOARDING_STORAGE_KEY) -> setChecked(true).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function find(type: string) {
  return renderer!.root.findAllByType(type as unknown as React.ElementType);
}

function retryButton() {
  return find("Pressable").filter(
    (n) => n.props.testID === "auth-retry-button"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.isLoading = false;
  authState.isAuthenticated = false;
  authState.hadPreviousSession = false;
  authState.authFailed = false;
  getItem.mockResolvedValue("true"); // onboarding già completato
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

describe("app/index — fallback auth (no spinner infinito)", () => {
  it("mostra lo spinner mentre l'auth è in caricamento (nessun pulsante Riprova)", async () => {
    authState.isLoading = true;
    await mount();
    expect(find("ActivityIndicator").length).toBeGreaterThan(0);
    expect(retryButton()).toHaveLength(0);
  });

  it("se authFailed e nessun utente: rende il fallback con 'auth-retry-button' invece dello spinner", async () => {
    authState.isLoading = false;
    authState.authFailed = true;
    authState.isAuthenticated = false;
    await mount();

    // Fallback presente: pulsante Riprova, NESSUNO spinner.
    expect(retryButton()).toHaveLength(1);
    expect(find("ActivityIndicator")).toHaveLength(0);
    // Non deve reindirizzare mentre mostra il fallback.
    expect(Redirect).not.toHaveBeenCalled();
  });

  it("onPress del pulsante Riprova invoca retryAuth", async () => {
    authState.authFailed = true;
    authState.isAuthenticated = false;
    await mount();

    const btn = retryButton()[0];
    expect(btn).toBeTruthy();
    await act(async () => {
      btn.props.onPress();
    });
    expect(authState.retryAuth).toHaveBeenCalledTimes(1);
  });

  it("se l'utente è autenticato reindirizza alle tabs (no spinner, no fallback) anche con authFailed", async () => {
    // Con un utente in cache il fallback NON deve comparire (authFailed ignorato).
    authState.authFailed = true;
    authState.isAuthenticated = true;
    await mount();

    expect(retryButton()).toHaveLength(0);
    expect(find("ActivityIndicator")).toHaveLength(0);
    expect(Redirect).toHaveBeenCalled();
    expect(Redirect.mock.calls[0][0]).toMatchObject({ href: "/(tabs)" });
  });
});
