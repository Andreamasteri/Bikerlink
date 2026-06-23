import { useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function FeedbackRedirect() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { type } = useLocalSearchParams<{ type?: string }>();

  useEffect(() => {
    if (type === "bug") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      routerRef.current.replace("/feedback/bug" as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
      routerRef.current.replace("/feedback/feature" as any);
    }
  }, [type]);

  return null;
}
