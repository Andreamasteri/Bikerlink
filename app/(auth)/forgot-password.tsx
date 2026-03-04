import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!email) { Alert.alert("Errore", "Inserisci la tua email"); return; }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: email.trim().toLowerCase() });
      Alert.alert("Codice Inviato", "Se l'email è registrata, riceverai un codice di recupero (controlla i log del server per il codice MVP)");
      setStep("code");
    } catch (err) {
      Alert.alert("Errore", "Errore nell'invio del codice");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code || !newPassword) { Alert.alert("Errore", "Compila tutti i campi"); return; }
    if (newPassword.length < 6) { Alert.alert("Errore", "La password deve avere almeno 6 caratteri"); return; }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { email: email.trim().toLowerCase(), code, newPassword });
      Alert.alert("Successo", "Password aggiornata con successo");
      setStep("done");
      router.replace("/(auth)/login");
    } catch (err: any) {
      Alert.alert("Errore", "Codice non valido o scaduto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {step === "email" && (
        <>
          <Text style={styles.title}>Recupera Password</Text>
          <Text style={styles.subtitle}>Inserisci la tua email per ricevere un codice di recupero</Text>
          <TextInput style={styles.input} placeholder="la-tua@email.it" placeholderTextColor={Colors.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Pressable style={styles.button} onPress={handleSendCode} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.buttonText}>Invia Codice</Text>}
          </Pressable>
        </>
      )}
      {step === "code" && (
        <>
          <Text style={styles.title}>Inserisci Codice</Text>
          <Text style={styles.subtitle}>Inserisci il codice ricevuto e la nuova password</Text>
          <TextInput style={styles.input} placeholder="Codice a 6 cifre" placeholderTextColor={Colors.textSecondary} value={code} onChangeText={setCode} keyboardType="numeric" maxLength={6} />
          <TextInput style={styles.input} placeholder="Nuova password" placeholderTextColor={Colors.textSecondary} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <Pressable style={styles.button} onPress={handleResetPassword} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.buttonText}>Reimposta Password</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, justifyContent: "center", flexGrow: 1, gap: 12 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.accent, textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginBottom: 16 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.text },
  button: { backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
});
