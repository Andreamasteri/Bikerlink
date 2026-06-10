import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

const WA_REGEX = /^\+?[1-9]\d{6,14}$/;

function normalizeWhatsapp(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

function validateWhatsapp(raw: string): string | null {
  if (raw.trim() === "") return null;
  const normalized = normalizeWhatsapp(raw);
  if (!WA_REGEX.test(normalized)) {
    return "Formato non valido. Usa formato internazionale es. +39XXXXXXXXXX";
  }
  return null;
}

function buildWaUrl(raw: string): string {
  const digits = normalizeWhatsapp(raw).replace(/^\+/, "");
  return `https://wa.me/${digits}`;
}

interface SupportData {
  email: string;
  whatsapp: string;
}

export function SupportSection() {
  const { data } = useQuery<SupportData>({
    queryKey: ["/api/settings/support"],
  });

  const [emailInput, setEmailInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappTouched, setWhatsappTouched] = useState(false);

  useEffect(() => {
    if (data?.email !== undefined) setEmailInput(data.email);
    if (data?.whatsapp !== undefined) {
      setWhatsappInput(data.whatsapp);
      setWhatsappError(null);
      setWhatsappTouched(false);
    }
  }, [data]);

  const whatsappIsValid =
    whatsappInput.trim() === "" || validateWhatsapp(whatsappInput) === null;
  const waPreviewUrl =
    whatsappInput.trim() !== "" && whatsappIsValid
      ? buildWaUrl(whatsappInput)
      : null;

  const emailMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/settings/support-email", { value: emailInput }),
    onSuccess: () => {
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/support"] });
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/settings/support-whatsapp", { value: whatsappInput }),
    onSuccess: () => {
      setWhatsappSaved(true);
      setTimeout(() => setWhatsappSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/support"] });
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="headset-outline" size={20} color={Colors.accent} />
        <Text style={styles.headerText}>Supporto tecnico</Text>
      </View>

      <Text style={styles.fieldLabel}>Indirizzo email supporto</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={emailInput}
          onChangeText={(v) => { setEmailInput(v); setEmailSaved(false); }}
          placeholder="es. supporto@bikerlink.app"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.btn, emailSaved && styles.btnSaved]}
          onPress={() => emailMutation.mutate()}
          disabled={emailMutation.isPending}
          testID="support-email-save"
        >
          {emailMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.background} />
          ) : emailSaved ? (
            <Ionicons name="checkmark" size={18} color={Colors.background} />
          ) : (
            <Text style={styles.btnText}>Imposta</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
        Numero WhatsApp supporto
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, whatsappTouched && !!whatsappError && styles.inputError]}
          value={whatsappInput}
          onChangeText={(v) => {
            setWhatsappInput(v);
            setWhatsappSaved(false);
            if (whatsappTouched) setWhatsappError(validateWhatsapp(v));
          }}
          onBlur={() => {
            setWhatsappTouched(true);
            setWhatsappError(validateWhatsapp(whatsappInput));
          }}
          placeholder="es. +39 123 456 7890"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="phone-pad"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.btn, whatsappSaved && styles.btnSaved, !whatsappIsValid && styles.btnDisabled]}
          onPress={() => whatsappMutation.mutate()}
          disabled={whatsappMutation.isPending || !whatsappIsValid}
          testID="support-whatsapp-save"
        >
          {whatsappMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.background} />
          ) : whatsappSaved ? (
            <Ionicons name="checkmark" size={18} color={Colors.background} />
          ) : (
            <Text style={styles.btnText}>Imposta</Text>
          )}
        </TouchableOpacity>
      </View>
      {whatsappTouched && !!whatsappError && (
        <Text style={styles.errorText}>{whatsappError}</Text>
      )}
      {waPreviewUrl !== null && (
        <View style={styles.previewRow}>
          <Ionicons name="logo-whatsapp" size={14} color={Colors.success} />
          <Text style={styles.previewLabel}>Link generato: </Text>
          <Text style={styles.previewUrl} numberOfLines={1}>{waPreviewUrl}</Text>
        </View>
      )}
      <Text style={styles.hint}>
        Lascia vuoto il numero WhatsApp per non mostrare quel canale agli utenti.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  headerText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  fieldLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  fieldLabelSpaced: {
    marginTop: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSaved: {
    backgroundColor: Colors.success,
  },
  btnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
    lineHeight: 16,
  },
  inputError: {
    borderColor: Colors.error,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
    marginTop: 5,
    lineHeight: 16,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    flexWrap: "nowrap",
  },
  previewLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  previewUrl: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.success,
    flexShrink: 1,
  },
});
