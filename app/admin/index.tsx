import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, findNodeHandle } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { styles } from "@/components/admin/AdminDashboardStyles";
import { TelemetryCard, GraphHopperCard, ValhallaCard, NominatimCard } from "@/components/admin/AdminStatsCards";
import { ServerEfficiencyCard } from "@/components/admin/ServerEfficiencyCard";
import { ThinkCentreCard } from "@/components/admin/ThinkCentreCard";
import { ThinkCentreEfficiencyCard } from "@/components/admin/ThinkCentreEfficiencyCard";
import { RoutingCoordinationCard } from "@/components/admin/RoutingCoordinationCard";
import { RoutingCloudBanner } from "@/components/admin/RoutingCloudBanner";
import { WhisperChainCard } from "@/components/admin/WhisperChainCard";
import { MatchingMonitorCard } from "@/components/admin/MatchingMonitorCard";
import { SystemHealthContainer } from "@/components/admin/SystemHealthContainer";
import type { SystemStatuses, DotStatus } from "@/components/admin/SystemHealthContainer";
import { adminGroups, OPEN_BY_DEFAULT } from "./admin-groups";
import type { AdminItem, AdminGroup } from "./admin-types";

function renderIcon(item: AdminItem, size = 28, color = Colors.accent) {
  switch (item.iconSet) {
    case "MaterialCommunityIcons":
      return <MaterialCommunityIcons name={item.icon} size={size} color={color} />;
    case "Ionicons":
      return <Ionicons name={item.icon} size={size} color={color} />;
    case "MaterialIcons":
      return <MaterialIcons name={item.icon} size={size} color={color} />;
  }
}

function renderGroupHeaderIcon(group: AdminGroup) {
  switch (group.headerIconSet) {
    case "MaterialCommunityIcons":
      return <MaterialCommunityIcons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
    case "Ionicons":
      return <Ionicons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
    case "MaterialIcons":
      return <MaterialIcons name={group.headerIcon} size={20} color={Colors.textSecondary} />;
  }
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
}: {
  text: string;
  query: string;
  style?: object | object[];
  highlightStyle?: object;
}) {
  if (!query) return <Text style={style}>{text}</Text>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <Text style={style}>{text}</Text>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <Text style={style}>
      {before}
      <Text style={[highlightStyle, styles.highlight]}>{match}</Text>
      {after}
    </Text>
  );
}

interface SystemCardDef {
  key: string;
  label: string;
  keywords: string[];
  ref: React.RefObject<View | null>;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

const UNKNOWN_STATUSES: SystemStatuses = {
  thinkcentre: "unknown",
  graphhopper: "unknown",
  valhalla: "unknown",
  nominatim: "unknown",
  ollama: "unknown",
  whisper: "unknown",
  ufw: "unknown",
  redis: "unknown",
  postgres: "unknown",
  pgadmin: "unknown",
  nginx: "unknown",
  uptimeKuma: "unknown",
  routing: "unknown",
  matching: "unknown",
};

async function fetchSystemProbe(): Promise<SystemStatuses> {
  const res = await fetch(new URL("/api/admin/system-probe", getApiUrl()).toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SystemStatuses>;
}

const FAST_POLL_DURATION_MS = 30_000;
const FAST_POLL_INTERVAL_MS = 3_000;
const NORMAL_POLL_INTERVAL_MS = 30_000;

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [systemStatuses, setSystemStatuses] = useState<SystemStatuses>(UNKNOWN_STATUSES);

  const scrollViewRef = useRef<ScrollView>(null);
  const thinkcentreRef = useRef<View>(null);
  const graphhopperRef = useRef<View>(null);
  const valhallaRef = useRef<View>(null);
  const nominatimRef = useRef<View>(null);
  const whisperRef = useRef<View>(null);
  const routingRef = useRef<View>(null);
  const matchingRef = useRef<View>(null);

  const [pollInterval, setPollInterval] = useState(FAST_POLL_INTERVAL_MS);

  useEffect(() => {
    const t = setTimeout(() => setPollInterval(NORMAL_POLL_INTERVAL_MS), FAST_POLL_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  const { data: probeData } = useQuery<SystemStatuses>({
    queryKey: ["/api/admin/system-probe"],
    queryFn: fetchSystemProbe,
    refetchInterval: pollInterval,
    staleTime: 25_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (!probeData) return;
    setSystemStatuses((prev) => ({ ...prev, ...probeData }));
  }, [probeData]);

  const handleThinkCentreStatuses = useCallback(
    (s: Pick<SystemStatuses, "thinkcentre" | "graphhopper" | "valhalla" | "nominatim" | "ollama" | "whisper" | "ufw" | "redis" | "postgres" | "pgadmin" | "nginx" | "uptimeKuma">) => {
      setSystemStatuses((prev) => ({ ...prev, ...s }));
    },
    []
  );

  const handleRoutingStatus = useCallback((routing: DotStatus) => {
    setSystemStatuses((prev) => ({ ...prev, routing }));
  }, []);

  function scrollToRef(ref: React.RefObject<View | null>) {
    if (!ref.current || !scrollViewRef.current) return;
    const nodeHandle = findNodeHandle(scrollViewRef.current);
    if (!nodeHandle) return;
    ref.current.measureLayout(
      nodeHandle,
      (_x, y) => scrollViewRef.current?.scrollTo({ y, animated: true }),
      () => {}
    );
  }

  const handleDotPress = useCallback((key: keyof SystemStatuses) => {
    const refMap: Partial<Record<keyof SystemStatuses, React.RefObject<View | null>>> = {
      thinkcentre: thinkcentreRef,
      ollama:      thinkcentreRef,
      ufw:         thinkcentreRef,
      redis:       thinkcentreRef,
      postgres:    thinkcentreRef,
      pgadmin:     thinkcentreRef,
      nginx:       thinkcentreRef,
      uptimeKuma:  thinkcentreRef,
      graphhopper: graphhopperRef,
      valhalla:    valhallaRef,
      nominatim:   nominatimRef,
      whisper:     whisperRef,
      routing:     routingRef,
      matching:    matchingRef,
    };
    const target = refMap[key] ?? thinkcentreRef;
    setTimeout(() => scrollToRef(target), 350);
  }, []);

  const normalizedSearch = normalize(search);

  const systemCardDefs = useMemo<SystemCardDef[]>(
    () => [
      {
        key: "thinkcentre",
        label: "ThinkCentre",
        keywords: ["thinkcentre", "think centre", "server di casa", "home server", "redis", "postgres", "postgresql", "nginx", "ufw", "pgadmin", "pg admin", "uptime kuma", "kuma", "tailscale", "minipc", "mini pc", "ollama", "ai locale", "llm locale"],
        ref: thinkcentreRef,
        icon: "server-network",
      },
      {
        key: "graphhopper",
        label: "GraphHopper",
        keywords: ["graphhopper", "graph hopper", "gh", "osm routing", "mappa percorso", "strade", "routing locale"],
        ref: graphhopperRef,
        icon: "map-marker-path",
      },
      {
        key: "valhalla",
        label: "Valhalla",
        keywords: ["valhalla", "routing engine", "motore routing", "curvy", "panoramico"],
        ref: valhallaRef,
        icon: "road-variant",
      },
      {
        key: "nominatim",
        label: "Nominatim",
        keywords: ["nominatim", "geocoding", "geocodifica", "indirizzo", "address", "osm address", "reverse geo"],
        ref: nominatimRef,
        icon: "map-search",
      },
      {
        key: "whisper",
        label: "Whisper AI",
        keywords: ["whisper", "speech", "voce", "audio", "riconoscimento vocale", "stt", "speech to text"],
        ref: whisperRef,
        icon: "microphone-outline",
      },
      {
        key: "routing",
        label: "Routing Coordination",
        keywords: ["routing", "coordinamento routing", "route", "percorso", "engine", "fallback routing", "graphhopper", "valhalla"],
        ref: routingRef,
        icon: "directions-fork",
      },
      {
        key: "matching",
        label: "Matching Monitor",
        keywords: ["matching", "match", "abbinamento", "proposta", "companion", "compagni di viaggio"],
        ref: matchingRef,
        icon: "account-multiple-check",
      },
    ],
    []
  );

  const matchedSystemCards = useMemo<SystemCardDef[]>(() => {
    if (!normalizedSearch) return [];
    return systemCardDefs.filter((card) =>
      normalize(card.label).includes(normalizedSearch) ||
      card.keywords.some((kw) => normalize(kw).includes(normalizedSearch))
    );
  }, [normalizedSearch, systemCardDefs]);

  function handleSystemCardPress(def: SystemCardDef) {
    if (["graphhopper", "valhalla", "nominatim"].includes(def.key)) {
      setRoutingCardCollapsed(false);
    }
    setSearch("");
    setTimeout(() => scrollToRef(def.ref), 450);
  }

  const [routingCardCollapsed, setRoutingCardCollapsed] = useState(true);

  const initialCollapsed = useMemo<Record<string, boolean>>(
    () => Object.fromEntries(adminGroups.map((g) => [g.title, !OPEN_BY_DEFAULT.has(g.title)])),
    []
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);

  function toggleGroup(title: string) {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  function handleItemPress(item: AdminItem) {
    if (item.route) {
      router.push(item.route as Href);
    }
  }

  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return adminGroups.map((g) => ({ ...g, titleMatched: false }));
    return adminGroups
      .map((group) => {
        const groupTitleMatches = normalize(group.title).includes(normalizedSearch);
        if (groupTitleMatches) return { ...group, titleMatched: true };
        return {
          ...group,
          titleMatched: false,
          items: group.items.filter((item) => {
            if (normalize(item.label).includes(normalizedSearch)) return true;
            if (item.keywords?.some((kw) => normalize(kw).includes(normalizedSearch))) return true;
            return false;
          }),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [normalizedSearch]);

  const isSearching = normalizedSearch.length > 0;
  const hasInput = search.length > 0;

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 20, paddingTop: 0 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca funzione…"
          placeholderTextColor={Colors.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          testID="admin-search-input"
        />
        {hasInput && (
          <TouchableOpacity
            onPress={() => setSearch("")}
            style={styles.clearButton}
            testID="admin-search-clear"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {!isSearching && (
        <>
          <RoutingCloudBanner onPress={() => router.push("/admin/routing-health" as never)} />
          <SystemHealthContainer statuses={systemStatuses} onDotPress={handleDotPress}>
            <ServerEfficiencyCard />
            <ThinkCentreEfficiencyCard />
            <View ref={thinkcentreRef}>
              <ThinkCentreCard onStatuses={handleThinkCentreStatuses} />
            </View>
            <View ref={routingRef}>
              <RoutingCoordinationCard
                onStatus={handleRoutingStatus}
                onCollapsedChange={setRoutingCardCollapsed}
              />
            </View>
            {!routingCardCollapsed && (
              <View style={styles.routingSubGroup}>
                <View ref={graphhopperRef}>
                  <GraphHopperCard />
                </View>
                <View ref={valhallaRef}>
                  <ValhallaCard />
                </View>
                <View ref={nominatimRef}>
                  <NominatimCard />
                </View>
                <TelemetryCard />
              </View>
            )}
            <View ref={whisperRef}>
              <WhisperChainCard />
            </View>
            <View ref={matchingRef}>
              <MatchingMonitorCard onStatus={(s) => setSystemStatuses((prev) => ({ ...prev, matching: s as DotStatus }))} />
            </View>
          </SystemHealthContainer>
        </>
      )}

      {isSearching && matchedSystemCards.length > 0 && (
        <View style={styles.systemSection}>
          <View style={styles.systemSectionHeader}>
            <MaterialCommunityIcons name="monitor-dashboard" size={16} color={Colors.textSecondary} />
            <Text style={styles.systemSectionTitle}>MONITORAGGIO SISTEMA</Text>
          </View>
          <View style={styles.grid}>
            {matchedSystemCards.map((def) => (
              <TouchableOpacity
                key={def.key}
                style={[styles.card, styles.systemCard]}
                onPress={() => handleSystemCardPress(def)}
                activeOpacity={0.7}
              >
                <View style={[styles.cardIcon, styles.systemCardIcon]}>
                  <MaterialCommunityIcons name={def.icon} size={28} color={Colors.accent} />
                </View>
                <HighlightedText
                  text={def.label}
                  query={search}
                  style={styles.cardLabel}
                />
                <Text style={styles.systemCardHint}>Vai al monitor →</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {isSearching && filteredGroups.length === 0 && matchedSystemCards.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Nessuna funzione trovata</Text>
        </View>
      )}

      {filteredGroups.map((group) => {
        const isCollapsed = !isSearching && !!collapsed[group.title];
        const titleQuery = isSearching && group.titleMatched ? search : "";
        return (
          <React.Fragment key={group.title}>
            <View style={styles.groupContainer}>
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => toggleGroup(group.title)}
                activeOpacity={0.7}
                disabled={isSearching}
              >
                <View style={styles.groupHeaderLeft}>
                  {renderGroupHeaderIcon(group)}
                  <HighlightedText
                    text={group.title}
                    query={titleQuery}
                    style={[styles.groupTitle, group.titleMatched && isSearching ? styles.groupTitleMatched : null]}
                  />
                </View>
                {!isSearching && (
                  <Ionicons
                    name={isCollapsed ? "chevron-down" : "chevron-up"}
                    size={18}
                    color={Colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
              {!isCollapsed && (
                <View style={styles.grid}>
                  {group.items.map((section) => {
                    const iconColor = section.accentColor || Colors.accent;
                    const itemMatches = isSearching && !group.titleMatched && normalize(section.label).includes(normalizedSearch);
                    return (
                      <TouchableOpacity
                        key={section.key}
                        style={[styles.card, itemMatches ? styles.cardMatched : null]}
                        onPress={() => handleItemPress(section)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.cardIcon}>
                          {renderIcon(section, 28, iconColor)}
                        </View>
                        <HighlightedText
                          text={section.label}
                          query={itemMatches ? search : ""}
                          style={styles.cardLabel}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

