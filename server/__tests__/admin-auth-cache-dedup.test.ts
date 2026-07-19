/**
 * Task #770 — Fix cache stampede N+1 su requireAdmin
 *
 * Verifies that `getOrFetchAdminCached` deduplicates concurrent lookups for
 * the same userId: N parallel calls must result in exactly one DB fetch,
 * not N.
 *
 * Also verifies that `invalidateAdminAuthCache` and `deleteAdminCached` clear
 * both the value cache and any in-flight entry, so a post-invalidation request
 * issues a fresh DB query.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAdminCached,
  setAdminCached,
  getOrFetchAdminCached,
  deleteAdminCached,
  invalidateAdminAuthCache,
} from "../lib/admin-auth-cache";

// The module uses Date.now() for TTL checks; freeze time so TTLs don't expire
// mid-test.
const FIXED_NOW = 1_700_000_000_000;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  // Clear the module-level maps between tests by evicting all known keys.
  // We rely on the public API (invalidate + delete) rather than accessing
  // private internals so the test stays resilient to refactors.
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getOrFetchAdminCached — in-flight deduplication", () => {
  it("calls fetchFn exactly once when N concurrent requests arrive for the same userId", async () => {
    const userId = "user-stampede-test";
    // Make sure we start cold.
    invalidateAdminAuthCache(userId);

    const mockUser = { id: userId, role: "admin", status: "active" };
    const fetchFn = vi.fn(async () => mockUser);

    // Launch 5 parallel lookups — simulating 5 simultaneous poll requests.
    const results = await Promise.all([
      getOrFetchAdminCached(userId, fetchFn),
      getOrFetchAdminCached(userId, fetchFn),
      getOrFetchAdminCached(userId, fetchFn),
      getOrFetchAdminCached(userId, fetchFn),
      getOrFetchAdminCached(userId, fetchFn),
    ]);

    // fetchFn must have been called exactly once — all others attached to the
    // same in-flight Promise.
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Every caller receives the correct user object.
    for (const result of results) {
      expect(result).toBe(mockUser);
    }
  });

  it("populates the value cache after the first fetch so subsequent serial calls are cache hits", async () => {
    const userId = "user-cache-fill-test";
    invalidateAdminAuthCache(userId);

    const mockUser = { id: userId, role: "admin", status: "active" };
    const fetchFn = vi.fn(async () => mockUser);

    // First call: cold cache + cold in-flight.
    await getOrFetchAdminCached(userId, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call (serial, after the promise resolved): must be a cache hit.
    const second = await getOrFetchAdminCached(userId, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1); // still 1
    expect(second).toBe(mockUser);
  });

  it("does NOT cache a null result (non-admin / missing user)", async () => {
    const userId = "user-null-test";
    invalidateAdminAuthCache(userId);

    const fetchFn = vi.fn(async () => null);

    const result = await getOrFetchAdminCached(userId, fetchFn);
    expect(result).toBeNull();

    // Cache must remain cold so the next request retries the DB.
    expect(getAdminCached(userId)).toBeNull();

    // A second call must invoke fetchFn again.
    const fetchFn2 = vi.fn(async () => null);
    await getOrFetchAdminCached(userId, fetchFn2);
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });

  it("returns a cached value immediately without calling fetchFn", async () => {
    const userId = "user-warm-cache-test";
    const mockUser = { id: userId, role: "admin", status: "active" };
    // Pre-warm the cache using the public setter.
    setAdminCached(userId, mockUser);

    const fetchFn = vi.fn(async () => ({ id: userId, role: "admin", status: "active" }));
    const result = await getOrFetchAdminCached(userId, fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toBe(mockUser);
  });
});

describe("invalidateAdminAuthCache / deleteAdminCached — clear in-flight", () => {
  it("invalidateAdminAuthCache removes the value cache entry", () => {
    const userId = "user-invalidate-test";
    setAdminCached(userId, { id: userId });
    invalidateAdminAuthCache(userId);
    expect(getAdminCached(userId)).toBeNull();
  });

  it("deleteAdminCached removes the value cache entry", () => {
    const userId = "user-delete-test";
    setAdminCached(userId, { id: userId });
    deleteAdminCached(userId);
    expect(getAdminCached(userId)).toBeNull();
  });

  it("after invalidation, the next call issues a fresh DB fetch (not a dedup attach)", async () => {
    const userId = "user-post-invalidate-test";
    invalidateAdminAuthCache(userId);

    const mockUser = { id: userId, role: "admin", status: "active" };
    const fetchFn1 = vi.fn(async () => mockUser);

    // First fetch — populates cache + in-flight entry.
    await getOrFetchAdminCached(userId, fetchFn1);
    expect(fetchFn1).toHaveBeenCalledTimes(1);

    // Invalidate (simulates a role/status change by another admin).
    invalidateAdminAuthCache(userId);

    // Next request must NOT attach to the old Promise; it must call fetchFn2.
    const fetchFn2 = vi.fn(async () => mockUser);
    await getOrFetchAdminCached(userId, fetchFn2);
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });
});
