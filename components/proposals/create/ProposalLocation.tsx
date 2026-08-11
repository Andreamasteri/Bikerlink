import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProposalLocationProps {
  departureAddress: string;
  setDepartureAddress: (val: string) => void;
  destinationAddress: string;
  setDestinationAddress: (val: string) => void;
  gpsSource: "profile" | "live" | "map" | null;
  setGpsSource: (val: "profile" | "live" | "map" | null) => void;
  gpsLoading: boolean;
  fetchLiveLocation: () => Promise<void>;
  setDepartureLat: (val: number | null) => void;
  setDepartureLng: (val: number | null) => void;
  setDestinationLat: (val: number | null) => void;
  setDestinationLng: (val: number | null) => void;
  setShowMapPicker: (val: boolean) => void;
  setMapPickerMode: (val: "departure" | "destination") => void;
  needsDestination: boolean;
  stops: string[];
  newStop: string;
  setNewStop: (val: string) => void;
  handleAddStop: () => void;
  handleRemoveStop: (idx: number) => void;
  onAiPlan?: () => void;
  onLoadRoute?: () => void;
}

export const ProposalLocation = ({
  departureAddress,
  setDepartureAddress,
  destinationAddress,
  setDestinationAddress,
  gpsSource,
  setGpsSource,
  gpsLoading,
  fetchLiveLocation,
  setDepartureLat,
  setDepartureLng,
  setDestinationLat,
  setDestinationLng,
  setShowMapPicker,
  setMapPickerMode,
  needsDestination,
  stops,
  newStop,
  setNewStop,
  handleAddStop,
  handleRemoveStop,
  onAiPlan,
  onLoadRoute,
}: ProposalLocationProps) => {
  return (
    <View>
      <Text style={styles.sectionTitle}>Punto di partenza</Text>
      <Text style={styles.fieldHint}>Descrizione del punto di partenza</Text>
      <TextInput
        style={styles.input}
        value={departureAddress}
        onChangeText={(value) => {
          setDepartureAddress(value);
          setDepartureLat(null);
          setDepartureLng(null);
          setGpsSource(null);
        }}
        placeholder="da qui...."
        placeholderTextColor={Colors.textSecondary}
      />

      <View style={styles.gpsStatusIndicator}>
        {gpsSource === "live" || gpsSource === "map" ? (
          <MaterialCommunityIcons name="thumb-up" size={20} color={Colors.success} />
        ) : (
          <Text style={styles.gpsStatusQuestion}>???</Text>
        )}
      </View>

      <View style={styles.gpsRow}>
        <TouchableOpacity
          style={[styles.gpsButton, gpsSource === "live" && { backgroundColor: Colors.accent + "30", borderColor: Colors.accent }]}
          onPress={() => {
            if (gpsSource === "live") {
              setGpsSource(null);
              setDepartureLat(null);
              setDepartureLng(null);
            } else {
              fetchLiveLocation();
            }
          }}
          disabled={gpsLoading}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#000" />
          )}
          <Text style={styles.gpsButtonText}>GPS LIVE</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.gpsButton, gpsSource === "map" && { backgroundColor: Colors.accent + "30", borderColor: Colors.accent }]}
          onPress={() => {
            setMapPickerMode("departure");
            setShowMapPicker(true);
          }}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={20} color="#000" />
          <Text style={styles.gpsButtonText}>DALLA MAPPA</Text>
        </TouchableOpacity>
      </View>

      {(onAiPlan || onLoadRoute) && (
        <View style={styles.routeRow}>
          {onAiPlan && (
            <TouchableOpacity style={styles.routeButton} onPress={onAiPlan}>
              <MaterialCommunityIcons name="robot" size={18} color={Colors.accent} />
              <Text style={styles.routeButtonText}>Pianifica AI</Text>
            </TouchableOpacity>
          )}
          {onLoadRoute && (
            <TouchableOpacity style={styles.routeButton} onPress={onLoadRoute}>
              <MaterialCommunityIcons name="map-marker-path" size={18} color={Colors.accent} />
              <Text style={styles.routeButtonText}>Carica percorso</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {needsDestination && (
        <>
          <Text style={styles.sectionTitle}>Destinazione *</Text>
          <TextInput
            style={styles.input}
            value={destinationAddress}
            onChangeText={(value) => {
              setDestinationAddress(value);
              setDestinationLat(null);
              setDestinationLng(null);
            }}
            placeholder="Dove sei diretto?"
            placeholderTextColor={Colors.textSecondary}
          />
          <TouchableOpacity
            style={[styles.gpsButton, { marginTop: 8 }]}
            onPress={() => {
              setMapPickerMode("destination");
              setShowMapPicker(true);
            }}
          >
            <MaterialCommunityIcons name="map-marker-path" size={20} color="#000" />
            <Text style={styles.gpsButtonText}>SELEZIONA SULLA MAPPA</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionTitle}>Tappe intermedie</Text>
      <View style={styles.stopInputRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={newStop}
          onChangeText={setNewStop}
          placeholder="Aggiungi una tappa..."
          placeholderTextColor={Colors.textSecondary}
        />
        <TouchableOpacity style={styles.addStopBtn} onPress={handleAddStop}>
          <MaterialCommunityIcons name="plus" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {stops.map((stop, idx) => (
        <View key={idx} style={styles.stopItem}>
          <MaterialCommunityIcons name="map-marker" size={18} color={Colors.accent} />
          <Text style={styles.stopText} numberOfLines={1}>{stop}</Text>
          <TouchableOpacity onPress={() => handleRemoveStop(idx)}>
            <MaterialCommunityIcons name="close-circle" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  fieldHint: {
    fontStyle: "italic",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -4,
    marginBottom: 6,
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
  gpsStatusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 2,
  },
  gpsStatusQuestion: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warning,
    letterSpacing: 2,
  },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 13,
    marginBottom: 4,
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  gpsButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  routeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  routeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent + "60",
  },
  routeButtonText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  stopInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  addStopBtn: {
    backgroundColor: Colors.accent,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stopItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stopText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
});
