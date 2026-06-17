import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { TAG_CATEGORY_SLUGS } from "@/shared/db/tags";
import { authFetchHeaders, getApiUrl } from "@/lib/query-client";

interface MapFilterBarProps {
  filterBiker: boolean;
  filterZavorrina: boolean;
  filterClubs?: boolean;
  filterEvents?: boolean;
  showEventPins?: boolean;
  topOffset?: number;
  // Task #2721 — tag moto attivi come filtro mappa + setter.
  motoTags?: string[];
  onChangeMotoTags?: (next: string[]) => void;
  onToggleFilterBiker: () => void;
  onToggleFilterZavorrina: () => void;
  onToggleFilterClubs?: () => void;
  onToggleFilterEvents?: () => void;
  filterVessels?: boolean;
  onToggleFilterVessels?: () => void;
  aisEnabled?: boolean;
}

// Task #2721 — risposta di GET /api/tags?category=<slug>.
type TagItem = { id: string; categoryId: string; slug: string; label: string };
type TagsByCategoryResponse = { category: string; tags: TagItem[] };

export function MapFilterBar({
  filterBiker,
  filterZavorrina,
  filterClubs,
  filterEvents: _filterEvents,
  showEventPins: _showEventPins,
  topOffset,
  motoTags,
  onChangeMotoTags,
  onToggleFilterBiker,
  onToggleFilterZavorrina,
  onToggleFilterClubs,
  onToggleFilterEvents: _onToggleFilterEvents,
  filterVessels,
  onToggleFilterVessels,
  aisEnabled,
}: MapFilterBarProps) {
  const [showMotoTagModal, setShowMotoTagModal] = useState(false);
  const selectedMotoTags = useMemo(() => motoTags ?? [], [motoTags]);
  const motoTagFilterActive = selectedMotoTags.length > 0;

  // Task #2721 — fetch esplicito: il default fetcher concatenerebbe la queryKey
  // sull'URL producendo /api/tags/<slug>, mentre il backend richiede
  // ?category=<slug>. Usiamo quindi un queryFn dedicato con auth headers.
  const fetchTagsByCategory = async (
    slug: string,
    signal?: AbortSignal,
  ): Promise<TagsByCategoryResponse> => {
    const url = new URL("/api/tags", getApiUrl());
    url.searchParams.set("category", slug);
    const res = await globalThis.fetch(url.toString(), {
      credentials: "include",
      headers: authFetchHeaders(),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TagsByCategoryResponse;
  };

  const tipoMotoQuery = useQuery<TagsByCategoryResponse>({
    queryKey: ["/api/tags", "category", TAG_CATEGORY_SLUGS.TIPO_MOTO],
    queryFn: ({ signal }) => fetchTagsByCategory(TAG_CATEGORY_SLUGS.TIPO_MOTO, signal),
    enabled: showMotoTagModal && onChangeMotoTags != null,
    staleTime: 5 * 60 * 1000,
  });
  const stileGuidaQuery = useQuery<TagsByCategoryResponse>({
    queryKey: ["/api/tags", "category", TAG_CATEGORY_SLUGS.STILE_GUIDA],
    queryFn: ({ signal }) => fetchTagsByCategory(TAG_CATEGORY_SLUGS.STILE_GUIDA, signal),
    enabled: showMotoTagModal && onChangeMotoTags != null,
    staleTime: 5 * 60 * 1000,
  });

  const toggleTag = (id: string) => {
    if (!onChangeMotoTags) return;
    const next = selectedMotoTags.includes(id)
      ? selectedMotoTags.filter((t) => t !== id)
      : [...selectedMotoTags, id];
    onChangeMotoTags(next);
  };

  const renderCategory = (title: string, q: typeof tipoMotoQuery) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {q.isLoading ? (
        <ActivityIndicator size="small" color={Colors.accent} />
      ) : q.isError ? (
        <Text style={styles.emptyText}>Impossibile caricare i tag. Riprova.</Text>
      ) : (q.data?.tags ?? []).length === 0 ? (
        <Text style={styles.emptyText}>Nessun tag disponibile.</Text>
      ) : (
        <View style={styles.tagWrap}>
          {(q.data?.tags ?? []).map((tag) => {
            const active = selectedMotoTags.includes(tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                onPress={() => toggleTag(tag.id)}
                style={[styles.tagChip, active && styles.tagChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.filterBar, topOffset != null && { top: topOffset }]}>
      <TouchableOpacity
        style={[styles.filterChip, filterBiker && { backgroundColor: Colors.maleIcon }]}
        onPress={onToggleFilterBiker}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="motorbike" size={16} color={filterBiker ? "#fff" : Colors.maleIcon} />
        <Text style={[styles.filterText, filterBiker && styles.filterTextActive]}>Biker</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.filterChip, filterZavorrina && { backgroundColor: Colors.femaleIcon }]}
        onPress={onToggleFilterZavorrina}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="seat-passenger" size={16} color={filterZavorrina ? "#fff" : Colors.femaleIcon} />
        <Text style={[styles.filterText, filterZavorrina && styles.filterTextActive]}>Zavorrina</Text>
      </TouchableOpacity>

      {onToggleFilterClubs != null && (
        <TouchableOpacity
          style={[styles.filterChip, filterClubs && { backgroundColor: "#009688" }]}
          onPress={onToggleFilterClubs}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="shield-check" size={16} color={filterClubs ? "#fff" : "#009688"} />
          <Text style={[styles.filterText, filterClubs && styles.filterTextActive]}>Motoclub</Text>
        </TouchableOpacity>
      )}

      {aisEnabled && onToggleFilterVessels != null && (
        <TouchableOpacity
          style={[styles.filterChip, filterVessels && { backgroundColor: "#0284c7" }]}
          onPress={onToggleFilterVessels}
          activeOpacity={0.7}
          testID="map-filter-vessels"
        >
          <MaterialCommunityIcons
            name="ferry"
            size={16}
            color={filterVessels ? "#fff" : "#0284c7"}
          />
          <Text style={[styles.filterText, filterVessels && styles.filterTextActive]}>Navi (20 nm)</Text>
        </TouchableOpacity>
      )}

      {onChangeMotoTags != null && (
        <TouchableOpacity
          style={[styles.filterChip, motoTagFilterActive && { backgroundColor: "#6A1B9A" }]}
          onPress={() => setShowMotoTagModal(true)}
          activeOpacity={0.7}
          testID="map-filter-moto-tags"
        >
          <MaterialCommunityIcons
            name="tag-multiple"
            size={16}
            color={motoTagFilterActive ? "#fff" : "#6A1B9A"}
          />
          <Text style={[styles.filterText, motoTagFilterActive && styles.filterTextActive]}>
            {motoTagFilterActive ? `Tag moto (${selectedMotoTags.length})` : "Tag moto"}
          </Text>
        </TouchableOpacity>
      )}

      <Modal
        transparent
        visible={showMotoTagModal}
        animationType="fade"
        onRequestClose={() => setShowMotoTagModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtra per tag moto</Text>
              <TouchableOpacity onPress={() => setShowMotoTagModal(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {renderCategory("Tipo moto", tipoMotoQuery)}
              {renderCategory("Stile di guida", stileGuidaQuery)}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => onChangeMotoTags && onChangeMotoTags([])}
                style={[styles.footerBtn, styles.footerBtnGhost]}
                disabled={!motoTagFilterActive}
              >
                <Text style={[styles.footerBtnText, !motoTagFilterActive && { opacity: 0.4 }]}>Azzera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowMotoTagModal(false)}
                style={[styles.footerBtn, styles.footerBtnPrimary]}
              >
                <Text style={[styles.footerBtnText, { color: "#fff" }]}>Fatto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    position: "absolute",
    top: 16,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  filterTextActive: {
    color: "#fff",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase" as const,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic" as const,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tagChipActive: {
    backgroundColor: "#6A1B9A",
    borderColor: "#6A1B9A",
  },
  tagChipText: {
    fontSize: 13,
    color: Colors.text,
  },
  tagChipTextActive: {
    color: "#fff",
    fontWeight: "600" as const,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  footerBtnGhost: {
    backgroundColor: Colors.background,
  },
  footerBtnPrimary: {
    backgroundColor: Colors.accent,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.text,
  },
});
