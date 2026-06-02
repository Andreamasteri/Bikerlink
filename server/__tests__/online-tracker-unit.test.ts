/**
 * Unit tests for OnlineTracker — system accounts must never enter the tracker.
 *
 * These tests exercise the in-memory class directly (no DB, no HTTP layer).
 * The online-tracker module is NOT mocked here so the real class is used.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OnlineTracker } from "../online-tracker";

const BASE_PAYLOAD = {
  role: "user" as const,
  nickname: "normal_user",
  status: "active",
  userType: "biker",
  isAvailable: true,
  ghostMode: false,
  country: "IT",
  isFake: false,
  isSystem: false,
};

describe("OnlineTracker — system accounts never enter the tracker", () => {
  let tracker: OnlineTracker;

  beforeEach(() => {
    tracker = new OnlineTracker();
  });

  it("setOnline() with isSystem=true does NOT add the user", () => {
    tracker.setOnline("sys-1", { ...BASE_PAYLOAD, isSystem: true });
    expect(tracker.isOnline("sys-1")).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it("setOnline() with role=admin does NOT add the user (legacy guard)", () => {
    tracker.setOnline("admin-1", { ...BASE_PAYLOAD, role: "admin" });
    expect(tracker.isOnline("admin-1")).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it("setOnline() with a protected nickname does NOT add the user (legacy guard)", () => {
    tracker.setOnline("official-1", { ...BASE_PAYLOAD, nickname: "BikerLink_Official" });
    expect(tracker.isOnline("official-1")).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it("setOnline() with isFake=true does NOT add the user", () => {
    tracker.setOnline("fake-1", { ...BASE_PAYLOAD, isFake: true });
    expect(tracker.isOnline("fake-1")).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it("setOnline() with status=banned does NOT add the user", () => {
    tracker.setOnline("banned-1", { ...BASE_PAYLOAD, status: "banned" });
    expect(tracker.isOnline("banned-1")).toBe(false);
    expect(tracker.size()).toBe(0);
  });

  it("setOnline() upgrading to isSystem=true removes the user from the map", () => {
    tracker.setOnline("u-1", { ...BASE_PAYLOAD });
    expect(tracker.isOnline("u-1")).toBe(true);
    tracker.setOnline("u-1", { ...BASE_PAYLOAD, isSystem: true });
    expect(tracker.isOnline("u-1")).toBe(false);
  });

  it("normal user IS added when all flags are benign", () => {
    tracker.setOnline("u-normal", BASE_PAYLOAD);
    expect(tracker.isOnline("u-normal")).toBe(true);
    expect(tracker.size()).toBe(1);
  });

  it("countOnlineUsers excludes system accounts that somehow entered internal map", () => {
    tracker.setOnline("u-normal", BASE_PAYLOAD);
    const countBefore = tracker.countOnlineUsers();
    tracker.setOnline("sys-1", { ...BASE_PAYLOAD, isSystem: true });
    expect(tracker.countOnlineUsers()).toBe(countBefore);
  });

  it("countAvailableBikers returns 0 when only a system biker is added", () => {
    tracker.setOnline("sys-biker", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true, isSystem: true });
    expect(tracker.countAvailableBikers()).toBe(0);
  });

  it("countAvailableZavorrine returns 0 when only a system zavorrina is added", () => {
    tracker.setOnline("sys-zav", { ...BASE_PAYLOAD, userType: "zavorrina", isAvailable: true, isSystem: true });
    expect(tracker.countAvailableZavorrine()).toBe(0);
  });

  it("getOnlineUserIds does NOT include system account ids", () => {
    tracker.setOnline("u-normal", BASE_PAYLOAD);
    tracker.setOnline("sys-1", { ...BASE_PAYLOAD, isSystem: true });
    const ids = tracker.getOnlineUserIds();
    expect(ids).toContain("u-normal");
    expect(ids).not.toContain("sys-1");
  });

  it("getAvailableBikerIds does NOT include system biker ids", () => {
    tracker.setOnline("u-biker", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true });
    tracker.setOnline("sys-biker", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true, isSystem: true });
    const ids = tracker.getAvailableBikerIds();
    expect(ids).toContain("u-biker");
    expect(ids).not.toContain("sys-biker");
  });

  it("getAvailableZavorrinaIds does NOT include system zavorrina ids", () => {
    tracker.setOnline("u-zav", { ...BASE_PAYLOAD, userType: "zavorrina", isAvailable: true });
    tracker.setOnline("sys-zav", { ...BASE_PAYLOAD, userType: "zavorrina", isAvailable: true, isSystem: true });
    const ids = tracker.getAvailableZavorrinaIds();
    expect(ids).toContain("u-zav");
    expect(ids).not.toContain("sys-zav");
  });

  it("all counter/getter methods return empty/zero when only system accounts are present", () => {
    tracker.setOnline("sys-1", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true, isSystem: true });
    tracker.setOnline("admin-1", { ...BASE_PAYLOAD, userType: "zavorrina", isAvailable: true, role: "admin" });
    tracker.setOnline("official-1", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true, nickname: "BikerLink_Official" });

    expect(tracker.countOnlineUsers()).toBe(0);
    expect(tracker.countAvailableBikers()).toBe(0);
    expect(tracker.countAvailableZavorrine()).toBe(0);
    expect(tracker.getOnlineUserIds()).toHaveLength(0);
    expect(tracker.getAvailableBikerIds()).toHaveLength(0);
    expect(tracker.getAvailableZavorrinaIds()).toHaveLength(0);
  });

  it("mixed tracker: normal users appear, system users do not", () => {
    tracker.setOnline("normal-biker", { ...BASE_PAYLOAD, userType: "biker", isAvailable: true });
    tracker.setOnline("normal-zav", { ...BASE_PAYLOAD, userType: "zavorrina", isAvailable: true });
    tracker.setOnline("sys-admin", { ...BASE_PAYLOAD, role: "admin" });
    tracker.setOnline("sys-flag", { ...BASE_PAYLOAD, isSystem: true });

    expect(tracker.countOnlineUsers()).toBe(2);
    expect(tracker.countAvailableBikers()).toBe(1);
    expect(tracker.countAvailableZavorrine()).toBe(1);

    const onlineIds = tracker.getOnlineUserIds();
    expect(onlineIds).toContain("normal-biker");
    expect(onlineIds).toContain("normal-zav");
    expect(onlineIds).not.toContain("sys-admin");
    expect(onlineIds).not.toContain("sys-flag");
  });
});
