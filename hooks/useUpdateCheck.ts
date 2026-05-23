import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export function useUpdateCheck(): { needsUpdate: boolean } {
  const { user } = useAuth();
  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function check() {
      try {
        const url = new URL("/api/version/latest", getApiUrl());
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { latestVersion?: string };
        const latest = data.latestVersion;
        if (!latest) return;
        const local = Constants.expoConfig?.version ?? "0.0.0";
        if (!cancelled && compareSemver(local, latest) < 0) {
          setNeedsUpdate(true);
        }
      } catch {
        // no-op: ignore version check failures
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { needsUpdate };
}
