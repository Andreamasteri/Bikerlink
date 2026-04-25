import { useState, useRef, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

const SEEN_KEY = "bikerlink:seenMatchIds";

function namespacedId(source: string, id: string | number): string {
  return `${source}:${id}`;
}

export function useNewMatchAlert() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedSources = useRef<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        if (raw) {
          try {
            seenRef.current = new Set(JSON.parse(raw));
          } catch {}
        }
        setSeenLoaded(true);
      })
      .catch(() => setSeenLoaded(true));
  }, []);

  const addSeen = (ids: string[]) => {
    ids.forEach((id) => seenRef.current.add(id));
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current])).catch(() => {});
  };

  const processSource = (sourceKey: string, items: Array<{ id: string | number }> | undefined) => {
    if (!seenLoaded || !items) return;
    const ids = items.map((m) => namespacedId(sourceKey, m.id));
    if (!initializedSources.current.has(sourceKey)) {
      addSeen(ids);
      initializedSources.current.add(sourceKey);
      return;
    }
    const newIds = ids.filter((id) => !seenRef.current.has(id));
    if (newIds.length > 0) {
      addSeen(newIds);
      setVisible(true);
    }
  };

  const enabled = !!user && Platform.OS !== "web";

  const { data: garageData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/garage-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: bikerData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/biker-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: proposalData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/matches"],
    refetchInterval: 30000,
    enabled,
  });

  useEffect(() => {
    processSource("garage", garageData);
  }, [garageData, seenLoaded]);

  useEffect(() => {
    processSource("biker", bikerData);
  }, [bikerData, seenLoaded]);

  useEffect(() => {
    processSource("proposals", proposalData);
  }, [proposalData, seenLoaded]);

  return { visible, dismiss: () => setVisible(false) };
}
