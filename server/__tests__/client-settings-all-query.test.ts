import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockGetAllAppSettings, mockGetAppSetting } = vi.hoisted(() => ({
  mockGetAllAppSettings: vi.fn(),
  mockGetAppSetting: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getAllAppSettings: mockGetAllAppSettings,
    getAppSetting: mockGetAppSetting,
  },
}));

import { registerPart2Routes } from "../routes/client-settings.part2";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  registerPart2Routes(app);
  return app;
}

describe("GET /api/settings/all", () => {
  beforeEach(() => {
    mockGetAllAppSettings.mockReset();
    mockGetAppSetting.mockReset();
  });

  it("loads the public settings with one storage query", async () => {
    mockGetAllAppSettings.mockResolvedValue([
      { key: "syneco_branding_visible", value: "true" },
      { key: "email_verification_enabled", value: "false" },
      { key: "chatbot_enabled", value: "false" },
      { key: "auto_matching_enabled", value: "true" },
      { key: "custom_routes_enabled", value: "false" },
      { key: "paypal_email", value: "payments@example.test" },
      { key: "sos_enabled", value: "true" },
      { key: "maps_enabled", value: "true" },
      { key: "maps_provider", value: "maplibre" },
      { key: "units_preference_enabled", value: "true" },
    ]);

    const response = await request(buildApp()).get("/api/settings/all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      synecoBranding: true,
      emailVerification: false,
      chatbotEnabled: false,
      autoMatching: true,
      customRoutes: false,
      paypalEmail: "payments@example.test",
      sosEnabled: true,
      mapsEnabled: true,
      mapsProvider: "maplibre",
      unitsPrefEnabled: true,
    });
    expect(mockGetAllAppSettings).toHaveBeenCalledTimes(1);
    expect(mockGetAppSetting).not.toHaveBeenCalled();
  });

  it("preserves the safe defaults when settings are absent", async () => {
    mockGetAllAppSettings.mockResolvedValue([]);

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
