import React from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.accent,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  info: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  desc: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
});

interface RegistrationSectionProps {
  emailVerifEnabled: boolean;
  onEmailVerifToggle: (val: boolean) => void;
  emailVerifLoading: boolean;
  phoneFieldEnabled: boolean;
  onPhoneFieldToggle: (val: boolean) => void;
  phoneFieldLoading: boolean;
  userAvailableOnLogin: boolean;
  onUserAvailableToggle: (val: boolean) => void;
  userAvailableLoading: boolean;
  primalEnabled: boolean;
  onPrimalToggle: (val: boolean) => void;
  primalLoading: boolean;
}

export function RegistrationSection({
  emailVerifEnabled,
  onEmailVerifToggle,
  emailVerifLoading,
  phoneFieldEnabled,
  onPhoneFieldToggle,
  phoneFieldLoading,
  userAvailableOnLogin,
  onUserAvailableToggle,
  userAvailableLoading,
  primalEnabled,
  onPrimalToggle,
  primalLoading,
}: RegistrationSectionProps) {
  const t = useT();

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="mail" size={20} color={Colors.accent} />
            <Text style={styles.label}>Verifica Email</Text>
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Verifica Email",
                  "Quando attiva, i nuovi utenti devono verificare l'email prima di accedere all'app."
                )
              }
              style={{ marginLeft: 6 }}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {emailVerifLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={emailVerifEnabled}
              onValueChange={onEmailVerifToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={emailVerifEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {emailVerifEnabled ? t("admin.emailVerifActive") : t("admin.emailVerifInactive")}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="call-outline" size={20} color={Colors.accent} />
            <Text style={styles.label}>Campo telefono in registrazione</Text>
          </View>
          {phoneFieldLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={phoneFieldEnabled}
              onValueChange={onPhoneFieldToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={phoneFieldEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {phoneFieldEnabled ? t("admin.phoneFieldVisible") : t("admin.phoneFieldHidden")}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="radio-button-on-outline" size={20} color={Colors.success} />
            <Text style={styles.label}>Utente Disponibile all'accesso</Text>
          </View>
          {userAvailableLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={userAvailableOnLogin}
              onValueChange={onUserAvailableToggle}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={userAvailableOnLogin ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {userAvailableOnLogin
            ? "Gli utenti risultano disponibili appena effettuato il login"
            : "Gli utenti risultano non disponibili al login (devono attivarsi manualmente)"}
        </Text>
      </View>

      <View style={[styles.card, { borderColor: "#FF3B30" }]}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Ionicons name="star" size={20} color="#FF3B30" />
            <Text style={styles.label}>Account Primal</Text>
          </View>
          {primalLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Switch
              value={primalEnabled}
              onValueChange={onPrimalToggle}
              trackColor={{ false: Colors.border, true: "#FF3B30" }}
              thumbColor={primalEnabled ? Colors.text : Colors.textSecondary}
            />
          )}
        </View>
        <Text style={styles.desc}>
          {primalEnabled
            ? "Account creati prima del rilascio ufficiale — badge speciale e vantaggi attivi"
            : "Badge Primal disattivato per tutti gli utenti"}
        </Text>
      </View>
    </View>
  );
}
