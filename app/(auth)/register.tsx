import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

const USER_TYPES = [
  { value: "biker", label: "Biker" },
  { value: "zavorrina", label: "Zavorrina/o" },
  { value: "coppia", label: "Coppia" },
] as const;

const COUPLE_CONFIGS = [
  { value: "mf", label: "M + F" },
  { value: "mm", label: "M + M" },
  { value: "ff", label: "F + F" },
] as const;

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    sex: "" as "male" | "female" | "",
    userType: "" as "biker" | "zavorrina" | "coppia" | "",
    coupleSexConfig: "" as "mm" | "mf" | "ff" | "",
    birthYear: "",
    region: "",
    invitationCode: "",
    eulaAccepted: false,
  });
  const [loading, setLoading] = useState(false);
  const [showRegions, setShowRegions] = useState(false);

  const updateForm = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegister = async () => {
    if (!form.nickname || !form.email || !form.password || !form.sex || !form.userType || !form.birthYear || !form.region) {
      Alert.alert("Errore", "Compila tutti i campi obbligatori");
      return;
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert("Errore", "Le password non coincidono");
      return;
    }
    if (form.password.length < 8) {
      Alert.alert("Errore", "La password deve avere almeno 8 caratteri");
      return;
    }
    if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      Alert.alert("Errore", "La password deve contenere almeno una maiuscola, una minuscola e un numero");
      return;
    }
    if (form.userType === "coppia" && !form.coupleSexConfig) {
      Alert.alert("Errore", "Seleziona la configurazione della coppia");
      return;
    }
    if (!form.eulaAccepted) {
      Alert.alert("Errore", "Devi accettare i termini e le condizioni");
      return;
    }

    setLoading(true);
    try {
      await register({
        nickname: form.nickname.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone || undefined,
        password: form.password,
        sex: form.sex,
        userType: form.userType,
        coupleSexConfig: form.userType === "coppia" ? form.coupleSexConfig : undefined,
        birthYear: parseInt(form.birthYear),
        region: form.region,
        invitationCode: form.invitationCode.trim() || undefined,
        eulaAccepted: true,
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err.message || "";
      try {
        const parsed = msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg;
        const json = JSON.parse(parsed);
        Alert.alert("Errore", json.message || "Errore nella registrazione");
      } catch {
        Alert.alert("Errore", msg || "Errore nella registrazione");
      }
    } finally {
      setLoading(false);
    }
  };

  const OptionButton = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <Pressable
      style={[styles.optionBtn, selected && styles.optionBtnSelected]}
      onPress={onPress}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Dati Account</Text>

      <Text style={styles.label}>Nickname *</Text>
      <TextInput style={styles.input} placeholder="Il tuo nickname" placeholderTextColor={Colors.textSecondary} value={form.nickname} onChangeText={(v) => updateForm("nickname", v)} />

      <Text style={styles.label}>Email *</Text>
      <TextInput style={styles.input} placeholder="la-tua@email.it" placeholderTextColor={Colors.textSecondary} value={form.email} onChangeText={(v) => updateForm("email", v)} autoCapitalize="none" keyboardType="email-address" />

      <Text style={styles.label}>Telefono (opzionale)</Text>
      <TextInput style={styles.input} placeholder="+39 123 456 7890" placeholderTextColor={Colors.textSecondary} value={form.phone} onChangeText={(v) => updateForm("phone", v)} keyboardType="phone-pad" />

      <Text style={styles.label}>Password *</Text>
      <TextInput style={styles.input} placeholder="Min 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero" placeholderTextColor={Colors.textSecondary} value={form.password} onChangeText={(v) => updateForm("password", v)} secureTextEntry />

      <Text style={styles.label}>Conferma Password *</Text>
      <TextInput style={styles.input} placeholder="Ripeti la password" placeholderTextColor={Colors.textSecondary} value={form.confirmPassword} onChangeText={(v) => updateForm("confirmPassword", v)} secureTextEntry />

      <Text style={styles.sectionTitle}>Profilo</Text>

      <Text style={styles.label}>Sesso *</Text>
      <View style={styles.optionRow}>
        <OptionButton label="Maschio" selected={form.sex === "male"} onPress={() => updateForm("sex", "male")} />
        <OptionButton label="Femmina" selected={form.sex === "female"} onPress={() => updateForm("sex", "female")} />
      </View>

      <Text style={styles.label}>Tipo Utente *</Text>
      <View style={styles.optionRow}>
        {USER_TYPES.map((ut) => (
          <OptionButton key={ut.value} label={ut.label} selected={form.userType === ut.value} onPress={() => updateForm("userType", ut.value)} />
        ))}
      </View>

      {form.userType === "coppia" && (
        <>
          <Text style={styles.label}>Configurazione Coppia *</Text>
          <View style={styles.optionRow}>
            {COUPLE_CONFIGS.map((cc) => (
              <OptionButton key={cc.value} label={cc.label} selected={form.coupleSexConfig === cc.value} onPress={() => updateForm("coupleSexConfig", cc.value)} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Anno di Nascita *</Text>
      <TextInput style={styles.input} placeholder="es. 1985" placeholderTextColor={Colors.textSecondary} value={form.birthYear} onChangeText={(v) => updateForm("birthYear", v)} keyboardType="numeric" maxLength={4} />

      <Text style={styles.label}>Regione *</Text>
      <Pressable style={styles.input} onPress={() => setShowRegions(!showRegions)}>
        <Text style={form.region ? styles.inputText : styles.placeholderText}>
          {form.region || "Seleziona regione"}
        </Text>
      </Pressable>
      {showRegions && (
        <View style={styles.regionList}>
          {REGIONS.map((r) => (
            <Pressable key={r} style={styles.regionItem} onPress={() => { updateForm("region", r); setShowRegions(false); }}>
              <Text style={[styles.regionText, form.region === r && { color: Colors.accent }]}>{r}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Codice Invito (opzionale)</Text>
      <TextInput style={styles.input} placeholder="Inserisci codice invito" placeholderTextColor={Colors.textSecondary} value={form.invitationCode} onChangeText={(v) => updateForm("invitationCode", v)} autoCapitalize="none" />

      <Pressable
        style={styles.eulaRow}
        onPress={() => updateForm("eulaAccepted", !form.eulaAccepted)}
      >
        <View style={[styles.checkbox, form.eulaAccepted && styles.checkboxChecked]}>
          {form.eulaAccepted && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.eulaText}>
          Ho letto e accetto i{" "}
          <Text style={styles.eulaLink} onPress={() => router.push("/(auth)/eula")}>
            Termini e Condizioni
          </Text>
        </Text>
      </Pressable>

      <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.buttonText}>Registrati</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.push("/(auth)/login")}>
        <Text style={styles.linkText}>Hai già un account? Accedi</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, gap: 8 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.accent, marginTop: 16, marginBottom: 4 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text, marginTop: 4 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  inputText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  placeholderText: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  optionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  optionBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    minWidth: 80,
    alignItems: "center",
  },
  optionBtnSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  optionText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  optionTextSelected: { color: Colors.accent },
  regionList: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, maxHeight: 200 },
  regionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  regionText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  eulaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: Colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  checkmark: { color: Colors.accent, fontSize: 16, fontFamily: "Inter_700Bold" },
  eulaText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  eulaLink: { color: Colors.accent, textDecorationLine: "underline" },
  button: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 16 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.accent, textAlign: "center", marginTop: 12 },
});
