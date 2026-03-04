import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const PROPOSAL_TYPES = [
  { key: "giro", label: "Giro", icon: "motorbike", color: Colors.maleIcon, forTypes: ["biker", "coppia"] },
  { key: "raduno", label: "Raduno", icon: "account-group", color: Colors.accent, forTypes: ["biker", "coppia"] },
  { key: "con_zavorrina", label: "Con zavorrina", icon: "seat-passenger", color: Colors.femaleIcon, forTypes: ["biker"] },
  { key: "richiesta", label: "Richiesta passaggio", icon: "hand-wave", color: Colors.femaleIcon, forTypes: ["zavorrina"] },
];

export default function CreateProposalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [proposalType, setProposalType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departureAddress, setDepartureAddress] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");

  const availableTypes = PROPOSAL_TYPES.filter((pt) =>
    pt.forTypes.includes(user?.userType ?? "biker")
  );

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/proposals", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message);
    },
  });

  const handleSubmit = () => {
    if (!proposalType) {
      Alert.alert(t("common.error"), "Seleziona un tipo di proposta");
      return;
    }
    if (!title.trim()) {
      Alert.alert(t("common.error"), "Inserisci un titolo");
      return;
    }

    const data: Record<string, unknown> = {
      proposalType,
      title: title.trim(),
      description: description.trim() || null,
      departureAddress: departureAddress.trim() || null,
      maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : null,
    };

    if (scheduledAt.trim()) {
      const parsed = new Date(scheduledAt.trim());
      if (!isNaN(parsed.getTime())) {
        data.scheduledAt = parsed.toISOString();
      }
    }

    createMutation.mutate(data);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("proposals.create"),
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { paddingTop: webTopInset }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Tipo di proposta</Text>
        <View style={styles.typeGrid}>
          {availableTypes.map((pt) => (
            <TouchableOpacity
              key={pt.key}
              style={[
                styles.typeCard,
                proposalType === pt.key && {
                  borderColor: pt.color,
                  backgroundColor: pt.color + "15",
                },
              ]}
              onPress={() => setProposalType(pt.key)}
            >
              <MaterialCommunityIcons
                name={pt.icon as any}
                size={32}
                color={proposalType === pt.key ? pt.color : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeCardLabel,
                  proposalType === pt.key && { color: pt.color },
                ]}
              >
                {pt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Titolo *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Es: Giro sui colli toscani"
          placeholderTextColor={Colors.textSecondary}
          maxLength={200}
        />

        <Text style={styles.sectionTitle}>Descrizione</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Descrivi la proposta..."
          placeholderTextColor={Colors.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles.sectionTitle}>{t("proposals.departure")}</Text>
        <TextInput
          style={styles.input}
          value={departureAddress}
          onChangeText={setDepartureAddress}
          placeholder="Es: Piazza del Duomo, Firenze"
          placeholderTextColor={Colors.textSecondary}
        />

        <Text style={styles.sectionTitle}>{t("proposals.date")}</Text>
        <TextInput
          style={styles.input}
          value={scheduledAt}
          onChangeText={setScheduledAt}
          placeholder="YYYY-MM-DD HH:MM"
          placeholderTextColor={Colors.textSecondary}
        />

        <Text style={styles.sectionTitle}>Max partecipanti</Text>
        <TextInput
          style={styles.input}
          value={maxParticipants}
          onChangeText={setMaxParticipants}
          placeholder="Lascia vuoto per illimitato"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!proposalType || !title.trim() || createMutation.isPending) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!proposalType || !title.trim() || createMutation.isPending}
          activeOpacity={0.8}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark" size={22} color="#000" />
              <Text style={styles.submitText}>{t("proposals.create")}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: Platform.OS === "web" ? 34 : 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600" as const,
    marginBottom: 8,
    marginTop: 16,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  typeCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  typeCardLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
    textAlign: "center",
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700" as const,
  },
});
