import { KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & { bottomOffset?: number; keyboardShouldPersistTaps?: "always" | "never" | "handled" };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="interactive"
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
