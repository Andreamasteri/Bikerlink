// Task #52 — isRoutingExplicitlyDisabled(): distingue un OFF confermato dall'admin
// da uno stato incerto (errore di lettura DB). Le sonde di correttezza saltano
// GH/Valhalla SOLO su OFF confermato; su errore devono eseguire il probe per non
// mascherare un guasto reale.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: { getAppSetting: mocks.getAppSetting },
}));

import { isRoutingExplicitlyDisabled } from "../routing/routing-kill-switch";

describe("isRoutingExplicitlyDisabled", () => {
  beforeEach(() => {
    mocks.getAppSetting.mockReset();
  });

  it("value='true' → routing abilitato → NON confermato disabilitato", async () => {
    mocks.getAppSetting.mockResolvedValue({ key: "routing_kill_switch", value: "true" });
    expect(await isRoutingExplicitlyDisabled()).toBe(false);
  });

  it("value='false' → OFF confermato dall'admin", async () => {
    mocks.getAppSetting.mockResolvedValue({ key: "routing_kill_switch", value: "false" });
    expect(await isRoutingExplicitlyDisabled()).toBe(true);
  });

  it("riga assente → trattata come OFF confermato (lettura riuscita)", async () => {
    mocks.getAppSetting.mockResolvedValue(undefined);
    expect(await isRoutingExplicitlyDisabled()).toBe(true);
  });

  it("errore di lettura DB → propaga (il chiamante fa .catch(()=>false) → esegue il probe)", async () => {
    mocks.getAppSetting.mockRejectedValue(new Error("db down"));
    await expect(isRoutingExplicitlyDisabled()).rejects.toThrow("db down");
    // Il gate delle sonde usa `.catch(() => false)`: uno stato incerto NON deve
    // far saltare le sonde di routing.
    const routingOff = await isRoutingExplicitlyDisabled().catch(() => false);
    expect(routingOff).toBe(false);
  });
});
