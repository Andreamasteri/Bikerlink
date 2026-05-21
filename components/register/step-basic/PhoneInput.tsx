import React from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface PhoneInputProps {
  phoneFieldEnabled: boolean;
  phonePrefix: string;
  setPhonePrefix: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  showPrefixModal: boolean;
  setShowPrefixModal: (v: boolean) => void;
  phonePrefixes: { code: string; country: string }[];
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  phoneFieldEnabled,
  phonePrefix,
  setPhonePrefix,
  phone,
  setPhone,
  showPrefixModal,
  setShowPrefixModal,
  phonePrefixes,
}) => {
  if (!phoneFieldEnabled) return null;

  return (
    <>
      <View style={styles.phoneRow}>
        <TouchableOpacity
          style={styles.prefixButton}
          onPress={() => setShowPrefixModal(true)}
          testID="open-prefix-modal"
        >
          <Text style={styles.prefixText}>{phonePrefix}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.phoneInputWrapper}>
          <TextInput
            style={styles.phoneInput}
            placeholder={t("register.step3.phonePlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="input-phone"
          />
        </View>
      </View>

      <Modal visible={showPrefixModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleziona prefisso</Text>
              <TouchableOpacity onPress={() => setShowPrefixModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={phonePrefixes}
              keyExtractor={(item) => item.code + item.country}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.prefixItem, phonePrefix === item.code && styles.prefixItemSelected]}
                  onPress={() => {
                    setPhonePrefix(item.code);
                    setShowPrefixModal(false);
                  }}
                >
                  <Text style={[styles.prefixItemCode, phonePrefix === item.code && styles.prefixItemCodeSelected]}>
                    {item.code}
                  </Text>
                  <Text style={[styles.prefixItemCountry, phonePrefix === item.code && styles.prefixItemCountrySelected]}>
                    {item.country}
                  </Text>
                  {phonePrefix === item.code && (
                    <Ionicons name="checkmark" size={20} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  prefixButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 58,
    gap: 4,
  },
  prefixText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  phoneInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 58,
  },
  phoneInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  prefixItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefixItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  prefixItemCode: {
    width: 60,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  prefixItemCodeSelected: {
    color: Colors.accent,
  },
  prefixItemCountry: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  prefixItemCountrySelected: {
    color: Colors.accent,
  },
});
