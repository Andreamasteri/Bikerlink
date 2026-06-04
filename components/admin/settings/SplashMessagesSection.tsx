import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";

interface SplashMessagesSectionProps {
  splashMode: string;
  handleSaveSplashMode: (mode: string) => Promise<void>;
  splashMessagesList: string[];
  handleSaveSplashList: (list: string[]) => Promise<void>;
}

export function SplashMessagesSection({
  splashMode,
  handleSaveSplashMode,
  splashMessagesList,
  handleSaveSplashList,
}: SplashMessagesSectionProps) {
  const queryClient = useQueryClient();

  const { data: singleMsgData } = useQuery<{ value: string }>({
    queryKey: ["/api/admin/settings/splash_message"],
  });
  const [singleMsg, setSingleMsg] = useState("");
  const [savingMode, setSavingMode] = useState(false);
  const [savingSingle, setSavingSingle] = useState(false);
  const [savingList, setSavingList] = useState(false);

  const [localList, setLocalList] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    if (singleMsgData?.value !== undefined) {
      setSingleMsg(singleMsgData.value);
    }
  }, [singleMsgData?.value]);

  useEffect(() => {
    setLocalList([...splashMessagesList]);
  }, [splashMessagesList]);

  const onSelectMode = async (mode: string) => {
    if (mode === splashMode) return;
    setSavingMode(true);
    try {
      await handleSaveSplashMode(mode);
    } finally {
      setSavingMode(false);
    }
  };

  const onSaveSingle = async () => {
    setSavingSingle(true);
    try {
      await apiRequest("PUT", "/api/admin/settings/splash_message", { value: singleMsg });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/splash_message"] });
    } catch (e: unknown) {
      Alert.alert("Errore", (e as Error).message);
    } finally {
      setSavingSingle(false);
    }
  };

  const onAddItem = () => {
    if (!newItem.trim()) return;
    setLocalList((prev) => [...prev, newItem.trim()]);
    setNewItem("");
  };

  const onRemoveItem = (idx: number) => {
    setLocalList((prev) => prev.filter((_, i) => i !== idx));
  };

  const onStartEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingText(localList[idx]);
  };

  const onConfirmEdit = () => {
    if (editingIdx === null) return;
    setLocalList((prev) =>
      prev.map((item, i) => (i === editingIdx ? editingText : item))
    );
    setEditingIdx(null);
    setEditingText("");
  };

  const onSaveList = async () => {
    setSavingList(true);
    try {
      await handleSaveSplashList(localList);
    } finally {
      setSavingList(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="images-outline" size={20} color={Colors.accent} />
        <Text style={styles.title}>Messaggi Splash</Text>
      </View>
      <Text style={styles.desc}>
        Messaggi mostrati nella welcome screen prima del login.
      </Text>

      {/* Mode selector */}
      <Text style={styles.label}>Modalità</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, splashMode === "standard" && styles.modeChipActive]}
          onPress={() => onSelectMode("standard")}
          disabled={savingMode}
        >
          <Text style={[styles.modeChipText, splashMode === "standard" && styles.modeChipTextActive]}>
            Standard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, splashMode === "cycle" && styles.modeChipActive]}
          onPress={() => onSelectMode("cycle")}
          disabled={savingMode}
        >
          <Text style={[styles.modeChipText, splashMode === "cycle" && styles.modeChipTextActive]}>
            Rotazione
          </Text>
        </TouchableOpacity>
      </View>

      {/* Standard mode */}
      {splashMode === "standard" && (
        <View style={styles.modeContent}>
          <TextInput
            style={[styles.input, { minHeight: 80 }]}
            placeholder="Messaggio singolo splash..."
            placeholderTextColor={Colors.textSecondary}
            value={singleMsg}
            onChangeText={setSingleMsg}
            multiline
            numberOfLines={3}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={onSaveSingle}
              disabled={savingSingle}
            >
              <Text style={styles.saveBtnText}>{savingSingle ? "..." : "Salva"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cycle mode */}
      {splashMode === "cycle" && (
        <View style={styles.modeContent}>
          {localList.length === 0 && (
            <Text style={styles.emptyText}>Nessun messaggio nella lista.</Text>
          )}
          {localList.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              {editingIdx === idx ? (
                <>
                  <TextInput
                    style={[styles.input, styles.listInput]}
                    value={editingText}
                    onChangeText={setEditingText}
                    multiline
                    autoFocus
                  />
                  <TouchableOpacity style={styles.iconBtn} onPress={onConfirmEdit}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={Colors.success} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.listItemText} numberOfLines={2}>{item}</Text>
                  <View style={styles.listItemActions}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => onStartEdit(idx)}>
                      <Ionicons name="pencil-outline" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => onRemoveItem(idx)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}

          {/* Add new item */}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.addInput]}
              placeholder="Nuovo messaggio..."
              placeholderTextColor={Colors.textSecondary}
              value={newItem}
              onChangeText={setNewItem}
              onSubmitEditing={onAddItem}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.iconBtn, styles.addBtn]}
              onPress={onAddItem}
              disabled={!newItem.trim()}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={onSaveList}
              disabled={savingList}
            >
              <Text style={styles.saveBtnText}>{savingList ? "..." : "Salva lista"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  desc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  modeChipActive: { backgroundColor: Colors.accent + "22", borderColor: Colors.accent },
  modeChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  modeChipTextActive: { color: Colors.accent },
  modeContent: { gap: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, textAlignVertical: "top",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.accent },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.background },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  listItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  listItemText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, flex: 1 },
  listItemActions: { flexDirection: "row", gap: 4 },
  listInput: { flex: 1, minHeight: 40, textAlignVertical: "top" },
  iconBtn: { padding: 4 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  addInput: { flex: 1 },
  addBtn: { padding: 2 },
});
