import React from "react";
import { View, Text, Modal, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { EdgeInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

export function ReadyInfoModal({
  visible,
  onClose,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  insets: EdgeInsets;
}) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>
            Come funziona questo schermo
          </Text>
          <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Disponibilità
            </Text>
            <View style={{ gap: 10 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.success, marginBottom: 4 }}>
                  Online disponibile
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Hai premuto il pulsante verde. Sei visibile sulla mappa, appari nelle liste "disponibili" e la tua posizione viene aggiornata in tempo reale. Gli altri biker possono trovarti e contattarti.
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#E07B00", marginBottom: 4 }}>
                  Online non disponibile
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Hai premuto il pulsante rosso ma l'app è ancora aperta. Risulti connesso all'app ma <Text style={{ fontFamily: "Inter_600SemiBold" }}>non appari nelle liste dei disponibili</Text>. La tua ultima posizione nota resta sulla mappa come punto "non disponibile". Puoi comunque usare chat e funzioni social.
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accentRed, marginBottom: 4 }}>
                  Offline
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  L'app è chiusa o non ha connessione. La posizione non viene aggiornata e dopo qualche minuto di inattività il server ti rimuove automaticamente dalla mappa. Nessuno può vederti finché non riapri l'app.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Ghost Mode
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                Quando attivo, risulti presente nell'app ma <Text style={{ fontFamily: "Inter_600SemiBold" }}>la tua posizione è nascosta</Text> agli altri utenti. Puoi vedere gli altri sulla mappa, ma nessuno può vedere te. Utile quando vuoi navigare senza essere disturbato.
              </Text>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Nascondi dalla mappa
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                La tua icona <Text style={{ fontFamily: "Inter_600SemiBold" }}>non appare sulla mappa</Text> della community, anche se sei online e disponibile. Puoi comunque interagire con la chat e con le altre funzioni. Utile quando vuoi essere "raggiungibile" senza mostrare dove ti trovi.
              </Text>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Randomizza posizione
            </Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                Quando sei offline, invece di scomparire dalla mappa, la tua posizione viene <Text style={{ fontFamily: "Inter_600SemiBold" }}>spostata casualmente</Text> di qualche centinaio di metri rispetto alla tua posizione reale. Gli altri vedono un punto approssimativo, non la tua casa o il tuo garage esatto.
              </Text>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Privacy & Posizione
            </Text>
            <View style={{ gap: 10 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                  Altera posizione (offuscamento)
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Aggiunge un offset casuale alla tua posizione GPS prima di inviarla al server. Gli altri vedono un punto vicino a te, ma non esattamente dove sei. Disattivala durante i giri in gruppo per essere localizzato correttamente dai compagni.
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                  Fake Home / Lavoro / Punto personalizzato
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Permette di impostare una <Text style={{ fontFamily: "Inter_600SemiBold" }}>posizione falsa</Text> per casa, lavoro o un qualsiasi altro luogo. Quando sei in quell'area, l'app mostra la posizione falsa invece di quella reale, proteggendo la tua privacy in luoghi sensibili.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 10 }}>
              Precisione GPS
            </Text>
            <View style={{ gap: 10 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                  Alta / Massima precisione
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Usa il GPS a piena potenza. Posizione più accurata (1–5 m), ma consuma più batteria. Ideale per navigazione e giri in moto.
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                  Bilanciata
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Buon compromesso tra accuratezza (~10–50 m) e consumo batteria. Adatta all'uso quotidiano quando non stai navigando attivamente.
                </Text>
              </View>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 4 }}>
                  Risparmio energetico
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
                  Usa principalmente il Wi-Fi e la rete mobile per stimare la posizione. Molto meno precisa (~100–500 m), ma con impatto minimo sulla batteria. Utile quando sei fermo o vuoi solo segnalare la zona in cui ti trovi.
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>Chiudi</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
