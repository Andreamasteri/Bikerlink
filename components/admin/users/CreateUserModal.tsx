import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import RegionPicker from "@/components/RegionPicker";

const USER_TYPES = [
  { value: "biker", label: "Biker" },
  { value: "zavorrina", label: "Zavorrina" },
  { value: "coppia", label: "Coppia" },
] as const;

const SEX_OPTIONS = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
] as const;

export interface CreateUserPayload {
  nickname: string;
  email: string;
  password: string;
  userType: "biker" | "zavorrina" | "coppia";
  sex?: string | null;
  birthYear?: number | null;
  region?: string | null;
}

interface CreateUserModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateUserPayload) => void;
  isLoading?: boolean;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState<"biker" | "zavorrina" | "coppia">("biker");
  const [sex, setSex] = useState<"M" | "F" | null>(null);
  const [birthYearStr, setBirthYearStr] = useState("");
  const [region, setRegion] = useState("");
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  useEffect(() => {
    if (!visible) {
      setNickname("");
      setEmail("");
      setPassword("");
      setUserType("biker");
      setSex(null);
      setBirthYearStr("");
      setRegion("");
      setShowRegionPicker(false);
    }
  }, [visible]);

  function handleReset() {
    setNickname("");
    setEmail("");
    setPassword("");
    setUserType("biker");
    setSex(null);
    setBirthYearStr("");
    setRegion("");
    setShowRegionPicker(false);
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  function handleSubmit() {
    if (!nickname.trim()) {
      Alert.alert("Errore", "Nickname obbligatorio");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      Alert.alert("Errore", "Email non valida");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Errore", "La password deve avere almeno 8 caratteri");
      return;
    }

    const birthYear = birthYearStr ? parseInt(birthYearStr, 10) : null;
    if (birthYearStr && (isNaN(birthYear!) || birthYear! < 1920 || birthYear! > new Date().getFullYear())) {
      Alert.alert("Errore", "Anno di nascita non valido");
      return;
    }

    onSubmit({
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      password,
      userType,
      sex: sex || null,
      birthYear: birthYear || null,
      region: region.trim() || null,
    });
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>Crea Utente</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Nickname *</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="es. Moto_Marco"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Email *</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="es. marco@email.it"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>Password temporanea * (min 8 caratteri)</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password iniziale"
                placeholderTextColor={Colors.textSecondary}
                secureTextEntry
              />

              <View style={styles.inlineRow}>
                <Text style={[styles.fieldLabel, styles.inlineLabel]}>Tipo utente *</Text>
                <View style={styles.chipRowInline}>
                  {USER_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.chip, userType === t.value && styles.chipActive]}
                      onPress={() => setUserType(t.value)}
                    >
                      <Text style={[styles.chipText, userType === t.value && styles.chipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inlineRow}>
                <Text style={[styles.fieldLabel, styles.inlineLabel]}>Sesso</Text>
                <View style={styles.chipRowInline}>
                  {SEX_OPTIONS.map((s) => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.chip, sex === s.value && styles.chipActive]}
                      onPress={() => setSex(sex === s.value ? null : s.value)}
                    >
                      <Text style={[styles.chipText, sex === s.value && styles.chipTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inlineRow}>
                <Text style={[styles.fieldLabel, styles.inlineLabel]}>Anno di nascita</Text>
                <TextInput
                  style={[styles.input, styles.inputCompact]}
                  value={birthYearStr}
                  onChangeText={setBirthYearStr}
                  placeholder="es. 1990"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>

              <Text style={styles.fieldLabel}>Regione</Text>
              <TouchableOpacity
                style={styles.regionSelector}
                onPress={() => setShowRegionPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={region ? styles.regionText : styles.regionPlaceholder}>
                  {region || "Seleziona regione"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.infoText}>
                  L'utente viene creato attivo senza verifica email. Potrà accedere subito con le credenziali impostate.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <Ionicons name="person-add-outline" size={18} color="#0D0D0D" />
                <Text style={styles.submitBtnText}>
                  {isLoading ? "Creazione in corso..." : "Crea Utente"}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RegionPicker
        visible={showRegionPicker}
        selectedRegion={region}
        onSelect={(r) => setRegion(r)}
        onClose={() => setShowRegionPicker(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  body: {
    padding: 20,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 8,
  },
  inlineLabel: {
    marginTop: 0,
    marginBottom: 0,
    flexShrink: 0,
  },
  chipRowInline: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flex: 1,
  },
  inputCompact: {
    width: 90,
    textAlign: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: "#0D0D0D",
  },
  regionSelector: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  regionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  regionPlaceholder: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#0D0D0D",
  },
});
