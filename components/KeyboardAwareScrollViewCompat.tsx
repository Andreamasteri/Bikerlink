import { KeyboardAvoidingView, ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & { bottomOffset?: number; keyboardShouldPersistTaps?: "always" | "never" | "handled" };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  bottomOffset,
  ...props
}: Props) {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
