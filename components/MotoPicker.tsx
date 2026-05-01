import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  TextInput,

} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/language-context";

interface MotoPickerProps {
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  items: string[];
  disabled?: boolean;
  label?: string;
}

export default function MotoPicker({
  value,
  onValueChange,
  placeholder,
  items,
  disabled = false,
  label,
}: MotoPickerProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const insets = useSafeAreaInsets();
  const t = useT();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, search]);

  const handleOpen = () => {
    if (disabled) return;
    setSearch("");
    setVisible(true);
  };

  const handleSelect = (item: string) => {
    onValueChange(item);
    setVisible(false);
    setSearch("");
  };

  return (
    <>
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={handleOpen}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.triggerText,
            !value && styles.triggerPlaceholder,
            disabled && styles.triggerTextDisabled,
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={disabled ? Colors.border : Colors.textSecondary}
        />
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            {
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            {label ? (
              <Text style={styles.modalTitle}>{label}</Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable onPress={() => setVisible(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("common.search") + "..."}
              placeholderTextColor={Colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoFocus={true}
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={[styles.item, value === item && styles.itemSelected]}
                onPress={() => handleSelect(item)}
              >
                <Text
                  style={[styles.itemText, value === item && styles.itemTextSelected]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
                {value === item && (
                  <Ionicons name="checkmark" size={18} color={Colors.accent} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t("common.noResults")}</Text>
              </View>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerDisabled: {
    opacity: 0.45,
  },
  triggerText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  triggerPlaceholder: {
    color: Colors.textSecondary,
  },
  triggerTextDisabled: {
    color: Colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    flex: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    paddingVertical: 12,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemSelected: {
    backgroundColor: Colors.accent + "12",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  itemText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  itemTextSelected: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.4,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
