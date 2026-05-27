import { describe, it, expect } from "vitest";
import { createFeedbackSchema } from "@shared/validators";

describe("createFeedbackSchema deviceInfo", () => {
  it("accepts payload without deviceInfo (backward compat)", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "bug",
      subject: "x",
      message: "y",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.deviceInfo).toBeUndefined();
  });

  it("accepts full deviceInfo payload", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "bug",
      subject: "Crash on map",
      message: "App freezes when opening map",
      deviceInfo: {
        model: "iPhone 15 Pro",
        platform: "ios",
        osVersion: "17.5",
        appVersion: "1.4.2",
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.deviceInfo?.model).toBe("iPhone 15 Pro");
      expect(r.data.deviceInfo?.platform).toBe("ios");
    }
  });

  it("accepts partial deviceInfo with nulls", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "feature",
      subject: "x",
      message: "y",
      deviceInfo: { model: "Pixel 7", platform: "android", osVersion: null, appVersion: null },
    });
    expect(r.success).toBe(true);
  });

  it("accepts ticketType=feature (regression: was previously rejected)", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "feature",
      subject: "x",
      message: "y",
    });
    expect(r.success).toBe(true);
  });

  it("rejects deviceInfo with non-string model", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "bug",
      subject: "x",
      message: "y",
      deviceInfo: { model: 123 as unknown as string },
    });
    expect(r.success).toBe(false);
  });

  it("rejects deviceInfo model exceeding max length", () => {
    const r = createFeedbackSchema.safeParse({
      ticketType: "bug",
      subject: "x",
      message: "y",
      deviceInfo: { model: "a".repeat(101) },
    });
    expect(r.success).toBe(false);
  });
});
