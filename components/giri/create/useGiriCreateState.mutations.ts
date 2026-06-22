import { useState, useCallback, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/query-client";

export function useGiriCreateMutations() {
  const saveMutation = (require("@tanstack/react-query").useMutation)({
    mutationFn: async (route: any) => {
      const res = await apiRequest("POST", "/api/planned-routes", route);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-routes"] });
    },
  });

  return { saveMutation };
}
