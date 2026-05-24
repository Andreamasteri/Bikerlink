import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function FeedbackRedirect() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();

  useEffect(() => {
    if (type === "bug") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace("/feedback/bug" as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      router.replace("/feedback/feature" as any);
    }
  }, [type, router]);

  return null;
}
