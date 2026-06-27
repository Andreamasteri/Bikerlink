import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { apiRequest, authFetchHeaders, getApiUrl, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { PENDING_ONBOARDING_TAGS_KEY } from "@/constants/onboarding";
import { trackEvent } from "@/lib/analytics";

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

const CATEGORY_ORDER = ["musica", "stile_guida", "tipo_moto"] as const;
const SUGGESTED_MIN = 2;

export type PendingOnboardingTags = Record<string, string[]>;

interface Props {
  onDone: () => void;
}

export default function OnboardingTagsStep({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const shownTrackedRef = useRef(false);

  useEffect(() => {
    if (shownTrackedRef.current) return;
    shownTrackedRef.current = true;
    trackEvent("onboarding_tags_shown");
  }, []);

  const categoriesQuery = useQuery<TagCategory[]>({
    queryKey: ["/api/tags/categories"],
  });

  const orderedCategories = useMemo(() => {
    const cats = categoriesQuery.data ?? [];
    return [...cats]
      .filter((c) => CATEGORY_ORDER.includes(c.slug as (typeof CATEGORY_ORDER)[number]))
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.slug as (typeof CATEGORY_ORDER)[number]);
        const bi = CATEGORY_ORDER.indexOf(b.slug as (typeof CATEGORY_ORDER)[number]);
        return ai - bi;
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { category: string; tags: TagItem[] };
      },
      enabled: !!cat.slug,
    })),
  });

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((acc, set) => acc + set.size, 0),
    [selected]
  );

  const toggleTag = useCallback((categorySlug: string, tagId: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[categorySlug] ?? []);
      if (set.has(tagId)) set.delete(tagId);
      else set.add(tagId);
      next[categorySlug] = set;
      return next;
    });
  }, []);

  const saveAuthedMutation = useMutation({
    mutationFn: async (vars: { categorySlug: string; tagIds: string[] }) => {
      const res = await apiRequest("PUT", "/api/users/me/tags", vars);
      return await res.json();
    },
  });

  const saveAuthedMutationRef = useRef(saveAuthedMutation);
  saveAuthedMutationRef.current = saveAuthedMutation;

  const persistAndExit = useCallback(
    async (skipped: boolean) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const payload: PendingOnboardingTags = {};
        for (const [slug, set] of Object.entries(selected)) {
          if (set.size > 0) payload[slug] = Array.from(set);
        }

        const hasSelections = Object.keys(payload).length > 0;
        const totalCount = Object.values(payload).reduce((acc, ids) => acc + ids.length, 0);
        const categoriesList = Object.keys(payload);

        if (skipped) {
          trackEvent("onboarding_tags_skipped", {
            hadSelections: hasSelections,
            count: totalCount,
          });
        }
        if (hasSelections) {
          trackEvent("onboarding_tags_saved", {
            count: totalCount,
            categories: categoriesList,
          });
        }

        if (hasSelections) {
          if (isAuthenticated) {
            for (const [categorySlug, tagIds] of Object.entries(payload)) {
              try {
                await saveAuthedMutationRef.current.mutateAsync({ categorySlug, tagIds });
              } catch {
                // best-effort: continue with next category
              }
            }
            queryClient.invalidateQueries({ queryKey: ["/api/users/me/tags"] });
          } else {
            try {
              await AsyncStorage.setItem(
                PENDING_ONBOARDING_TAGS_KEY,
                JSON.stringify(payload)
              );
            } catch {
              // no-op: pending tags will simply not be applied later
            }
          }
        } else if (skipped) {
          try {
            await AsyncStorage.removeItem(PENDING_ONBOARDING_TAGS_KEY);
          } catch {
            // no-op
          }
        }
      } finally {
        setSubmitting(false);
        onDone();
      }
    },
    [selected, isAuthenticated, onDone, submitting]
  );

  const handleContinue = useCallback(() => {
    persistAndExit(false);
  }, [persistAndExit]);

  const handleSkip = useCallback(() => {
    persistAndExit(true);
  }, [persistAndExit]);

  const isLoading = categoriesQuery.isLoading;
  const showHint = totalSelected > 0 && totalSelected < SUGGESTED_MIN;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Ultimo passo</Text>
        <Text style={styles.title}>Cosa ti piace della moto?</Text>
        <Text style={styles.subtitle}>
          Scegli qualche tag per aiutarci a trovarti biker compatibili. Puoi
          modificarli in qualsiasi momento dal profilo.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : categoriesQuery.isError ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>
            Non riusciamo a caricare i tag adesso. Puoi sceglierli più tardi dal
            tuo profilo.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {orderedCategories.map((cat, idx) => {
            const query = tagQueries[idx] as {
              data?: { tags: TagItem[] };
              isLoading: boolean;
            };
            const tags = query?.data?.tags ?? [];
            const selectedSet = selected[cat.slug] ?? new Set<string>();
            return (
              <View key={cat.id} style={styles.categoryBlock}>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                {query?.isLoading ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : tags.length === 0 ? (
                  <Text style={styles.empty}>
                    Nessun tag in questa categoria.
                  </Text>
                ) : (
                  <View style={styles.chipsRow}>
                    {tags.map((tag) => {
                      const isOn = selectedSet.has(tag.id);
                      return (
                        <TouchableOpacity
                          key={tag.id}
                          testID={`onboarding-tag-${tag.slug}`}
                          style={[styles.chip, isOn && styles.chipActive]}
                          onPress={() => toggleTag(cat.slug, tag.id)}
                          disabled={submitting}
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
          })}
        </ScrollView>
      )}

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        {showHint && (
          <Text style={styles.hint}>
            Aggiungine almeno {SUGGESTED_MIN} per match più accurati 🎯
          </Text>
        )}
        <Pressable
          testID="onboarding-tags-continue"
          style={({ pressed }) => [
            styles.primaryBtn,
            (submitting || pressed) && styles.primaryBtnPressed,
          ]}
          onPress={handleContinue}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.primaryBtnText}>
              {totalSelected > 0
                ? `Salva ${totalSelected} tag e continua`
                : "Continua"}
            </Text>
          )}
        </Pressable>
        <Pressable
          testID="onboarding-tags-skip"
          style={styles.skipBtn}
          onPress={handleSkip}
          disabled={submitting}
          hitSlop={8}
        >
          <Text style={styles.skipText}>Salta, lo farò più tardi</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  categoryBlock: {
    marginBottom: 20,
  },
  categoryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  empty: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
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
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    fontFamily: "Inter_500Medium",
  },
  chipTextActive: {
    color: Colors.background,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 10,
  },
  hint: {
    fontSize: 12,
    color: Colors.accent,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
  skipBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
  },
});
