import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function TelemetryInfoModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="speedometer-outline" size={20} color={Colors.accent} />
            <Text style={styles.headerTitle}>Come funziona la Telemetria</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Section title="Cos'è">
              <Text style={styles.bodyText}>
                La telemetria misura come guidi: velocità, angolo di piega, accelerazioni e percorsi.
                Viene raccolta solo durante le uscite in moto reali — mai durante soste o spostamenti a piedi.
              </Text>
            </Section>

            <Section title="A cosa serve">
              <Text style={styles.bodyText}>I dati raccolti migliorano due cose:</Text>
              <BulletRow icon="map-outline" color={Colors.accent} label="Routing" desc="i percorsi suggeriti imparano dal tuo stile di guida" />
              <BulletRow icon="people-outline" color="#9b59b6" label="Matching" desc="trovi biker con uno stile simile al tuo (velocità, curve, durata delle uscite)" />
            </Section>

            <Section title="Come si raccoglie">
              <View style={styles.modeCard}>
                <View style={styles.modeHeader}>
                  <View style={[styles.modeDot, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.modeTitle}>Telemetria sempre attiva (raccomandata)</Text>
                </View>
                <Text style={styles.modeDesc}>
                  Con il toggle attivo e il telefono calibrato sul supporto, l{"'"}app riconosce
                  automaticamente quando sei in moto e inizia a raccogliere. Non devi fare nulla.
                </Text>
                <Text style={styles.modeNote}>
                  Richiede: calibrazione supporto effettuata (sezione qui sopra).
                </Text>
              </View>

              <View style={[styles.modeCard, { marginTop: 8 }]}>
                <View style={styles.modeHeader}>
                  <View style={[styles.modeDot, { backgroundColor: "#e74c3c" }]} />
                  <Text style={styles.modeTitle}>Telemetria sempre attiva OFF</Text>
                </View>
                <Text style={styles.modeDesc}>
                  La raccolta parte solo quando avvii manualmente una sessione di tracking dalla sezione Giri.
                </Text>
              </View>
            </Section>

            <Section title="I 4 Giri Ideali">
              <Text style={styles.bodyText}>
                Sono sessioni speciali che puoi registrare nelle condizioni migliori — tempo perfetto,
                nessun traffico, tuta da moto. I dati di questi giri vengono{" "}
                <Text style={styles.bold}>aggiunti alla tua telemetria totale</Text> e rappresentano
                il tuo stile di guida "al massimo".
              </Text>
            </Section>

            <Section title="Target 1000 km">
              <Text style={styles.bodyText}>
                Raggiungi 1000 km raccolti per sbloccare le analisi avanzate dello stile di guida
                e migliorare la qualità dei tuoi match.
              </Text>
            </Section>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.closeBtnText}>Capito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BulletRow({ icon, color, label, desc }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; desc: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <Text style={styles.bodyText}>
        <Text style={styles.bold}>{label}</Text>
        {" — "}
        {desc}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 0,
  },
  section: {
    marginBottom: 20,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    flexShrink: 1,
  },
  bold: {
    fontFamily: "Inter_600SemiBold",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 6,
  },
  modeCard: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modeTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  modeDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modeNote: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  closeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
});
