import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

const AMOUNTS = [1, 5, 10];

export default function PayPalDonation() {
  const [visible, setVisible] = useState(false);
  const { data } = useQuery({ queryKey: ["/api/settings/paypal_donation_address"] });
  const paypalAddress = (data as any)?.address;

  if (!paypalAddress) return null;

  const handleDonate = (amount: number) => {
    const url = `https://www.paypal.com/donate?business=${encodeURIComponent(paypalAddress)}&amount=${amount}&currency_code=EUR`;
    Linking.openURL(url);
    setVisible(false);
  };

  return (
    <>
      <Pressable style={styles.donateButton} onPress={() => setVisible(true)}>
        <Ionicons name="heart" size={22} color={Colors.accentRed} />
        <Text style={styles.donateLabel}>Sostienici</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Ionicons name="heart" size={36} color={Colors.accentRed} />
            <Text style={styles.modalTitle}>Supporta BikerLink</Text>
            <Text style={styles.modalDesc}>Scegli un importo per la donazione via PayPal</Text>

            <View style={styles.amountsRow}>
              {AMOUNTS.map((amount) => (
                <Pressable key={amount} style={styles.amountBtn} onPress={() => handleDonate(amount)}>
                  <Text style={styles.amountText}>{amount}€</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.cancelBtn} onPress={() => setVisible(false)}>
              <Text style={styles.cancelText}>Annulla</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  donateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  donateLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: 300,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  modalDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  amountsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  amountBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minWidth: 70,
    alignItems: "center",
  },
  amountText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.background,
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
