import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface DatePickerProps {
  birthYear: string;
  setBirthYear: (v: string) => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ birthYear, setBirthYear }) => {
  return (
    <View style={styles.inputWrapper}>
      <Ionicons name="calendar-outline" size={22} color={Colors.textSecondary} style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={t("register.step3.birthYearPlaceholder")}
        placeholderTextColor={Colors.textSecondary}
        value={birthYear}
        onChangeText={setBirthYear}
        keyboardType="number-pad"
        maxLength={4}
        testID="input-birthyear"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 58,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 19,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
});
