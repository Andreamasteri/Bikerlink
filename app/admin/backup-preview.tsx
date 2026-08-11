// @no-split
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "@/components/admin/backup-preview.styles";

export default function BackupPreviewScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#166534" style={{ marginRight: 8 }} />
          <Text style={[styles.bannerText, { color: "#166534" }]}>
            Backup protetti: anteprima disabilitata
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup dati</Text>
          <Text style={styles.value}>
            I backup reali contengono dati personali e restano nel percorso privato
            di storage. Questa schermata non mostra utenti, email, password,
            foto o campagne.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Regola operativa</Text>
          <Text style={styles.value}>
            Il backup è automatico e regolare. Il ripristino è eccezionale,
            autorizzato e viene eseguito soltanto su un ambiente temporaneo
            prima di qualsiasi intervento su production.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stato</Text>
          <Text style={styles.value}>
            R2 privato come archivio primario, copia secondaria su Google Drive,
            checksum SHA-256 registrato per ogni archivio.
          </Text>
        </View>

        <Ionicons name="lock-closed-outline" size={32} color={Colors.textSecondary} style={{ alignSelf: "center", marginTop: 12 }} />
      </ScrollView>
    </View>
  );
}
