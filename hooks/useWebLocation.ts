import { useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import { apiRequest } from "@/lib/query-client";

export interface WebLocationResult {
  latitude: number | null;
  longitude: number | null;
  available: boolean | null;
  updatedAt: string | null;
}

const POLL_INTERVAL_MS = 30_000;

export function useWebLocation(): WebLocationResult {
  const [result, setResult] = useState<WebLocationResult>({
    latitude: null,
    longitude: null,
    available: null,
    updatedAt: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    mountedRef.current = true;

    const fetchPosition = async () => {
      try {
        const res = await apiRequest("GET", "/api/users/my-last-position");
        const data = await res.json();
        if (!mountedRef.current) return;
        if (data?.available) {
          setResult({
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            available: true,
            updatedAt: data.updatedAt ?? null,
          });
        } else {
          setResult((prev) => ({ ...prev, available: false }));
        }
      } catch {
        if (mountedRef.current) {
          setResult((prev) => ({ ...prev, available: null }));
        }
      }
    };

    fetchPosition();
    const interval = setInterval(fetchPosition, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return result;
}
