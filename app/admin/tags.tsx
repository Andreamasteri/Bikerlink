import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

type TagCategory = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
};

type Tag = {
  id: string;
  categoryId: string;
  slug: string;
  label: string;
};

type TagWithCategory = { tag: Tag; category: TagCategory };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function AdminTagsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [addCategorySlug, setAddCategorySlug] = useState<string>("");
  const [addLabel, setAddLabel] = useState("");

  const categoriesQuery = useQuery<TagCategory[]>({
    queryKey: ["/api/admin/tags/categories"],
    staleTime: 60_000,
  });

  const tagsQuery = useQuery<{ tags: TagWithCategory[] }>({
    queryKey: ["/api/admin/tags"],
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const out = new Map<string, { category: TagCategory; tags: Tag[] }>();
    const cats = categoriesQuery.data ?? [];
    cats.forEach((c) => out.set(c.id, { category: c, tags: [] }));
    (tagsQuery.data?.tags ?? []).forEach(({ tag, category }) => {
      const existing = out.get(category.id);
      if (existing) existing.tags.push(tag);
      else out.set(category.id, { category, tags: [tag] });
    });
    return Array.from(out.values());
  }, [categoriesQuery.data, tagsQuery.data]);

  const createTagMutation = useMutation({
    mutationFn: async (input: { categorySlug: string; slug: string; label: string }) => {
      return apiRequest("POST", "/api/admin/tags", input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
      setShowAdd(false);
      setAddLabel("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore creazione tag";
      Alert.alert("Errore", msg);
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tags"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore eliminazione";
      Alert.alert("Errore", msg);
    },
  });

  function handleDelete(tag: Tag) {
    Alert.alert(
      "Eliminare il tag?",
      `"${tag.label}" sarà rimosso. Le associazioni esistenti verranno cancellate (cascade).`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteTagMutation.mutate(tag.id),
        },
      ],
    );
  }

  function handleCreate() {
    const slug = slugify(addLabel);
    if (!addCategorySlug) {
      Alert.alert("Manca la categoria", "Seleziona una categoria.");
      return;
    }
    if (!slug) {
      Alert.alert("Etichetta non valida", "Inserisci un'etichetta valida.");
      return;
    }
    createTagMutation.mutate({ categorySlug: addCategorySlug, slug, label: addLabel.trim() });
  }

  const isLoading = categoriesQuery.isLoading || tagsQuery.isLoading;
  const isError = categoriesQuery.isError || tagsQuery.isError;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
      >
        <Text style={styles.subtitle}>
          Categorie e tag riusabili. Le associazioni alle entità (utenti, moto) usano la
          tabella entity_tags.
        </Text>

        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        )}
        {isError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#ef4444" />
            <Text style={styles.errorText}>Errore caricamento tag</Text>
          </View>
        )}

        {grouped.map(({ category, tags }) => (
          <View key={category.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{category.label}</Text>
                <Text style={styles.cardSlug}>slug: {category.slug}</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{tags.length}</Text>
              </View>
            </View>
            {category.description && (
              <Text style={styles.cardDescription}>{category.description}</Text>
            )}
            <View style={styles.tagWrap}>
              {tags.length === 0 && (
                <Text style={styles.emptyText}>Nessun tag in questa categoria.</Text>
              )}
              {tags.map((tag) => (
                <View key={tag.id} style={styles.tagChip}>
                  <Text style={styles.tagLabel}>{tag.label}</Text>
                  <Text style={styles.tagSlug}>{tag.slug}</Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(tag)}
                    style={styles.deleteBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => {
          setAddCategorySlug(categoriesQuery.data?.[0]?.slug ?? "");
          setShowAdd(true);
        }}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.fabText}>Nuovo tag</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuovo tag</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Categoria</Text>
            <View style={styles.chipRow}>
              {(categoriesQuery.data ?? []).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setAddCategorySlug(c.slug)}
                  style={[
                    styles.catChip,
                    addCategorySlug === c.slug && styles.catChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      addCategorySlug === c.slug && styles.catChipTextSelected,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Etichetta</Text>
            <TextInput
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="es. Classic Rock"
              placeholderTextColor={Colors.textSecondary}
              style={styles.input}
              maxLength={120}
            />
            <Text style={styles.helperText}>
              Slug generato: <Text style={styles.slugPreview}>{slugify(addLabel) || "—"}</Text>
            </Text>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreate}
              disabled={createTagMutation.isPending}
            >
              {createTagMutation.isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Crea tag</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  center: { padding: 24, alignItems: "center" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    marginBottom: 12,
  },
  errorText: { color: "#ef4444", fontFamily: "Inter_500Medium", fontSize: 13 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.text },
  cardSlug: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  cardDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    marginTop: 6,
  },
  countBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  tagSlug: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  deleteBtn: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary, marginTop: 10, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  catChipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "22" },
  catChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  catChipTextSelected: { color: Colors.accent },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
  },
  helperText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  slugPreview: { fontFamily: "Inter_600SemiBold", color: Colors.text },
  saveBtn: {
    marginTop: 16,
    backgroundColor: Colors.accent,
    paddingVertical: 13, borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
