import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

interface FavoriteStarProps {
  targetUserId: string;
  size?: number;
}

export default function FavoriteStar({ targetUserId, size = 16 }: FavoriteStarProps) {
  const { data: favoriteIds } = useQuery<string[]>({
    queryKey: ["/api/favorites"],
  });

  const isFavorite = (favoriteIds ?? []).includes(targetUserId);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/favorites/${targetUserId}`);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/favorites"] });
      const previous = queryClient.getQueryData<string[]>(["/api/favorites"]);
      queryClient.setQueryData<string[]>(["/api/favorites"], (old) => {
        if (!old) return isFavorite ? [] : [targetUserId];
        if (old.includes(targetUserId)) {
          return old.filter((id) => id !== targetUserId);
        }
        return [...old, targetUserId];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/favorites"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
  });

  return (
    <TouchableOpacity
      onPress={(e) => {
        e.stopPropagation();
        toggleMutation.mutate();
      }}
      style={styles.container}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      activeOpacity={0.6}
    >
      <Ionicons
        name={isFavorite ? "star" : "star-outline"}
        size={size}
        color={isFavorite ? "#FFD700" : "#FFFFFF"}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 2,
  },
});
