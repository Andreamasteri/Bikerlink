import React, { useState, useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

export default function BowieScreen() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const handleClose = () => {
    setVisible(false);
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <AssistantChatSheet visible={visible} onClose={handleClose} />
    </View>
  );
}
