import React, { useState, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { Colors } from "@/constants/colors";
import InteractiveMap from "@/components/InteractiveMap";

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [isAvailable, setIsAvailable] = useState(false);
  const [filterBiker, setFilterBiker] = useState(true);
  const [filterZavorrina, setFilterZavorrina] = useState(true);
  const [filterCoppia, setFilterCoppia] = useState(true);

  const nearbyUsersQuery = useQuery<any[]>({
    queryKey: ["/api/users/nearby"],
    retry: false,
    staleTime: 30000,
  });

  const workshopsQuery = useQuery<any[]>({
    queryKey: ["/api/workshops"],
    retry: false,
    staleTime: 60000,
  });

  const easterEggsQuery = useQuery<any[]>({
    queryKey: ["/api/easter-eggs/nearby"],
    retry: false,
    staleTime: 60000,
  });

  const toggleAvailability = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/users/me/availability", {
        isAvailable: !isAvailable,
      });
      return await res.json();
    },
    onSuccess: () => {
      setIsAvailable((prev) => !prev);
      queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
    },
    onError: () => {
      setIsAvailable((prev) => !prev);
    },
  });

  const handleToggleAvailability = useCallback(() => {
    setIsAvailable((prev) => !prev);
    toggleAvailability.mutate();
  }, []);

  return (
    <View
      style={[
        styles.container,
        Platform.OS === "web" && { paddingTop: 67 },
      ]}
    >
      <InteractiveMap
        users={nearbyUsersQuery.data ?? []}
        workshops={workshopsQuery.data ?? []}
        easterEggs={easterEggsQuery.data ?? []}
        isAvailable={isAvailable}
        onToggleAvailability={handleToggleAvailability}
        filterBiker={filterBiker}
        filterZavorrina={filterZavorrina}
        filterCoppia={filterCoppia}
        onToggleFilterBiker={() => setFilterBiker((p) => !p)}
        onToggleFilterZavorrina={() => setFilterZavorrina((p) => !p)}
        onToggleFilterCoppia={() => setFilterCoppia((p) => !p)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
