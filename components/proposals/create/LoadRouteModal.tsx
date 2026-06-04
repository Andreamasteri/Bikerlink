import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  FlatList,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface PlannedRouteItem {
  id: string;
  title: string;
  distanceKm: number;
  style: string;
  waypoints: Array<{ lat: number; lng: number; name?: string }>;
}

export interface LoadedRouteResult {
  departure: { lat: number; lng: number; name: string };
  stops: string[];
  destination: { lat: number; lng: number; name: string } | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onRouteSelected: (result: LoadedRouteResult) => void;
}

const STYLE_LABELS: Record<string, string> = {
  curvy: "Curvy",
  balanced: "Bilanciato",
  fast: "Veloce",
};

export const LoadRouteModal = ({ visible, onClose, onRouteSelected }: Props) => {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<PlannedRouteItem[]>({
    queryKey: ["/api/planned-routes"],
    enabled: visible,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- api shape varies
    select: (d: any) => (Array.isArray(d) ? d : []),
  });

  const handleSelect = (route: PlannedRouteItem) => {
    const wps = route.waypoints ?? [];
    if (wps.length < 1) return;

    const first = wps[0];
    const departure = {
      lat: first.lat,
      lng: first.lng,
      name: first.name || route.title,
    };

    const hasEnd = wps.length > 1;
    const last = hasEnd ? wps[wps.length - 1] : null;
    const destination = last
      ? {
          lat: last.lat,
          lng: last.lng,
          name: last.name || `${last.lat.toFixed(4)}, ${last.lng.toFixed(4)}`,
        }
      : null;

    const intermediates = hasEnd ? wps.slice(1, -1) : [];
    const stops = intermediates.map(
      (w) => w.name || `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`
    );

    onRouteSelected({ departure, stops, destination });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="map-marker-path"
              size={22}
              color={Colors.accent}
            />
            <Text style={styles.title}>Carica percorso</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Seleziona un percorso salvato per caricare automaticamente partenza, tappe
          e destinazione nella proposta.
        </Text>

        {isLoading ? (
          <ActivityIndicator
            style={styles.loader}
            size="large"
            color={Colors.accent}
          />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              (data ?? []).length === 0 ? styles.emptyContainer : styles.listContent
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.routeItem}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="map-marker-path"
                  size={22}
                  color={Colors.accent}
                />
                <View style={styles.routeInfo}>
                  <Text style={styles.routeName} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.routeMeta}>
                    {item.distanceKm
                      ? `${Math.round(item.distanceKm)} km`
                      : "—"}
                    {item.style
                      ? ` · ${STYLE_LABELS[item.style] ?? item.style}`
                      : ""}
                    {item.waypoints?.length
                      ? ` · ${item.waypoints.length} tappe`
                      : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons
                  name="map-search"
                  size={48}
                  color={Colors.textSecondary}
                />
                <Text style={styles.emptyText}>Nessun percorso salvato</Text>
                <Text style={styles.emptySubText}>
                  Vai su Route Planning per creare il tuo primo percorso
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    lineHeight: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  loader: {
    marginTop: 60,
  },
  listContent: {
    padding: 12,
    gap: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginVertical: 4,
    marginHorizontal: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
  routeMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
});
