import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, authFetchHeaders, getApiUrl, queryClient } from "@/lib/query-client";

interface TagCategory {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
}

interface TagItem {
  id: string;
  categoryId: string;
  slug: string;
  label: string;
}

interface EntityTag extends TagItem {
  categorySlug: string;
  categoryLabel: string;
}

const CATEGORY_ORDER = ["musica", "stile_guida", "tipo_moto"] as const;

interface EditTagsProps {
  /**
   * Tipo di entità a cui assegnare i tag. Default "user" (retro-compatibile).
   */
  entityType?: "user" | "motorcycle";
  /**
   * Id dell'entità. Richiesto per entityType="motorcycle";
   * ignorato per entityType="user" (usa l'utente corrente).
   */
  entityId?: string;
  /**
   * Override opzionali per UI compatta (es. dentro card moto).
   */
  title?: string;
  helper?: string | null;
  compact?: boolean;
}

export function EditTags({
  entityType = "user",
  entityId,
  title,
  helper,
  compact = false,
}: EditTagsProps) {
  const tagsEndpoint =
    entityType === "motorcycle"
      ? `/api/motorcycles/${entityId}/tags`
      : "/api/users/me/tags";

  const enabled = entityType === "user" || !!entityId;

  const categoriesQuery = useQuery<TagCategory[]>({
    queryKey: ["/api/tags/categories"],
  });

  const entityTagsQuery = useQuery<{ tags: EntityTag[] }>({
    queryKey: [tagsEndpoint],
    enabled,
  });

  const orderedCategories = useMemo(() => {
    const cats = categoriesQuery.data ?? [];
    return [...cats].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.slug as (typeof CATEGORY_ORDER)[number]);
      const bi = CATEGORY_ORDER.indexOf(b.slug as (typeof CATEGORY_ORDER)[number]);
      const aRank = ai === -1 ? 999 : ai;
      const bRank = bi === -1 ? 999 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.localeCompare(b.label);
    });
  }, [categoriesQuery.data]);

  const tagQueries = useQueries({
    queries: orderedCategories.map((cat) => ({
      queryKey: ["/api/tags", "category", cat.slug],
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const url = new URL("/api/tags", getApiUrl());
        url.searchParams.set("category", cat.slug);
        const res = await globalThis.fetch(url.toString(), {
          credentials: "include",
          headers: authFetchHeaders(),
          signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as { category: string; tags: TagItem[] };
      },
      enabled: !!cat.slug,
    })),
  });

  const selectedByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const t of entityTagsQuery.data?.tags ?? []) {
      if (!map.has(t.categorySlug)) map.set(t.categorySlug, new Set());
      map.get(t.categorySlug)!.add(t.id);
    }
    return map;
  }, [entityTagsQuery.data]);

  const updateTagsMutation = useMutation({
    mutationFn: async (vars: { categorySlug: string; tagIds: string[] }) => {
      const res = await apiRequest("PUT", tagsEndpoint, vars);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tagsEndpoint] });
    },
  });

  const toggleTag = (categorySlug: string, tagId: string) => {
    const current = selectedByCategory.get(categorySlug) ?? new Set<string>();
    const next = new Set(current);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    updateTagsMutation.mutate({ categorySlug, tagIds: Array.from(next) });
  };

  const isLoading =
    categoriesQuery.isLoading || (enabled && entityTagsQuery.isLoading);

  const resolvedTitle =
    title ?? (entityType === "motorcycle" ? "Tag di questa moto" : "I tuoi tag");
  const resolvedHelper =
    helper === null
      ? null
      : helper ??
        (entityType === "motorcycle"
          ? "Seleziona i tag che descrivono questa moto."
          : "Seleziona i tag che ti rappresentano: ci aiutano a trovarti compagni di viaggio compatibili.");

  return (
    <View style={[styles.fieldGroup, compact && styles.fieldGroupCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.groupTitle}>{resolvedTitle}</Text>
        {updateTagsMutation.isPending && (
          <ActivityIndicator size="small" color={Colors.accent} />
        )}
      </View>
      {resolvedHelper && <Text style={styles.helper}>{resolvedHelper}</Text>}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : orderedCategories.length === 0 ? (
        <Text style={styles.empty}>Nessuna categoria tag disponibile.</Text>
      ) : (
        orderedCategories.map((cat, idx) => {
          const query = tagQueries[idx] as {
            data?: { tags: TagItem[] };
            isLoading: boolean;
          };
          const catTags = query?.data?.tags ?? [];
          const selected = selectedByCategory.get(cat.slug) ?? new Set<string>();
          return (
            <View key={cat.id} style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              {query?.isLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : catTags.length === 0 ? (
                <Text style={styles.empty}>Nessun tag in questa categoria.</Text>
              ) : (
                <View style={styles.chipsRow}>
                  {catTags.map((tag) => {
                    const isOn = selected.has(tag.id);
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        testID={`tag-chip-${entityType}-${tag.slug}`}
                        style={[styles.chip, isOn && styles.chipActive]}
                        onPress={() => toggleTag(cat.slug, tag.id)}
                        disabled={updateTagsMutation.isPending}
                      >
                        {isOn && (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={Colors.background}
                            style={{ marginRight: 4 }}
                          />
                        )}
                        <Text
                          style={[
                            styles.chipText,
                            isOn && styles.chipTextActive,
                          ]}
                        >
                          {tag.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldGroupCompact: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  helper: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: "center",
  },
  empty: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  categoryBlock: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "500" as const,
  },
  chipTextActive: {
    color: Colors.background,
    fontWeight: "600" as const,
  },
});
