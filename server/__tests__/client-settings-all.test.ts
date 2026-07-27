import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getAppSettings: vi.fn(),
  getAppSetting: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: storageMocks,
}));

vi.mock("../lib/api-response", () => ({
  sendSuccess: vi.fn(),
  sendError: vi.fn(),
}));

import { registerPart2Routes } from "../routes/client-settings.part2";

function buildApp() {
  const app = express();
  registerPart2Routes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/settings/all", () => {
  it("preserva forma e default con chiavi mancanti usando una sola lettura batch", async () => {
    storageMocks.getAppSettings.mockResolvedValue(Array(10).fill(undefined));

    const response = await request(buildApp()).get("/api/settings/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      synecoBranding: false,
      emailVerification: false,
      chatbotEnabled: true,
      autoMatching: true,
      customRoutes: true,
      paypalEmail: "",
      sosEnabled: true,
      mapsEnabled: true,
      mapsProvider: "carto_light",
      unitsPrefEnabled: false,
    });
    expect(storageMocks.getAppSettings).toHaveBeenCalledTimes(1);
    expect(storageMocks.getAppSettings).toHaveBeenCalledWith([
      "syneco_branding_visible",
      "email_verification_enabled",
      "chatbot_enabled",
      "auto_matching_enabled",
      "custom_routes_enabled",
      "paypal_email",
      "sos_enabled",
      "maps_enabled",
      "maps_provider",
      "units_preference_enabled",
    ]);
    expect(storageMocks.getAppSetting).not.toHaveBeenCalled();
  });

  it("mantiene la stessa mappatura JSON quando le chiavi sono presenti", async () => {
    storageMocks.getAppSettings.mockResolvedValue([
      { key: "syneco_branding_visible", value: "true" },
      { key: "email_verification_enabled", value: "true" },
      { key: "chatbot_enabled", value: "false" },
      { key: "auto_matching_enabled", value: "false" },
      { key: "custom_routes_enabled", value: "false" },
      { key: "paypal_email", value: "payments@example.test" },
      { key: "sos_enabled", value: "false" },
      { key: "maps_enabled", value: "false" },
      { key: "maps_provider", value: "mapbox" },
      { key: "units_preference_enabled", value: "true" },
    ]);

    const response = await request(buildApp()).get("/api/settings/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      synecoBranding: true,
      emailVerification: true,
      chatbotEnabled: false,
      autoMatching: false,
      customRoutes: false,
      paypalEmail: "payments@example.test",
      sosEnabled: false,
      mapsEnabled: false,
      mapsProvider: "mapbox",
      unitsPrefEnabled: true,
    });
  });

  it("preserva il fallback quando la lettura batch fallisce", async () => {
    storageMocks.getAppSettings.mockRejectedValue(new Error("database unavailable"));

    const response = await request(buildApp()).get("/api/settings/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      synecoBranding: false,
      emailVerification: false,
      chatbotEnabled: true,
      autoMatching: true,
      customRoutes: true,
      paypalEmail: "",
      sosEnabled: true,
      mapsEnabled: true,
      mapsProvider: "carto_light",
      unitsPrefEnabled: false,
    });
  });
});
