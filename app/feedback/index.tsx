import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function FeedbackRedirect() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();

  useEffect(() => {
    if (type === "bug") {
      router.replace("/feedback/bug" as any);
    } else {
      router.replace("/feedback/feature" as any);
    }
  }, [type]);

  return null;
}
