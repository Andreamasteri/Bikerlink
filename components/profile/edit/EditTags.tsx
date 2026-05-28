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

interface UserTag extends TagItem {
  categorySlug: string;
  categoryLabel: string;
}

const CATEGORY_ORDER = ["musica", "stile_guida", "tipo_moto"] as const;

export function EditTags() {
  const categoriesQuery = useQuery<TagCategory[]>({
    queryKey: ["/api/tags/categories"],
  });

  const userTagsQuery = useQuery<{ tags: UserTag[] }>({
    queryKey: ["/api/users/me/tags"],
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
    for (const t of userTagsQuery.data?.tags ?? []) {
      if (!map.has(t.categorySlug)) map.set(t.categorySlug, new Set());
      map.get(t.categorySlug)!.add(t.id);
    }
    return map;
  }, [userTagsQuery.data]);

  const updateTagsMutation = useMutation({
    mutationFn: async (vars: { categorySlug: string; tagIds: string[] }) => {
      const res = await apiRequest("PUT", "/api/users/me/tags", vars);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/tags"] });
    },
  });

  const toggleTag = (categorySlug: string, tagId: string) => {
    const current = selectedByCategory.get(categorySlug) ?? new Set<string>();
    const next = new Set(current);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    updateTagsMutation.mutate({ categorySlug, tagIds: Array.from(next) });
  };

  const isLoading = categoriesQuery.isLoading || userTagsQuery.isLoading;

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.headerRow}>
        <Text style={styles.groupTitle}>I tuoi tag</Text>
        {updateTagsMutation.isPending && (
          <ActivityIndicator size="small" color={Colors.accent} />
        )}
      </View>
      <Text style={styles.helper}>
        Seleziona i tag che ti rappresentano: ci aiutano a trovarti compagni di
        viaggio compatibili.
      </Text>

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
          const tags = query?.data?.tags ?? [];
          const selected = selectedByCategory.get(cat.slug) ?? new Set<string>();
          return (
            <View key={cat.id} style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              {query?.isLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : tags.length === 0 ? (
                <Text style={styles.empty}>Nessun tag in questa categoria.</Text>
              ) : (
                <View style={styles.chipsRow}>
                  {tags.map((tag) => {
                    const isOn = selected.has(tag.id);
                    return (
                      <TouchableOpacity
                        key={tag.id}
                        testID={`tag-chip-${tag.slug}`}
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
