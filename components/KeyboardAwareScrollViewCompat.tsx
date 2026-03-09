import { Platform, ScrollView, ScrollViewProps } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import type { KeyboardAwareScrollViewProps } from "react-native-keyboard-controller";

type Props = KeyboardAwareScrollViewProps & ScrollViewProps & { bottomOffset?: number };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  bottomOffset,
  ...props
}: Props) {
  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
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
