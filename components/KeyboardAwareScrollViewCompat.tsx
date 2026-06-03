import { Platform, ScrollView, ScrollViewProps, StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type Props = ScrollViewProps & {
  bottomOffset?: number;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
};

export function KeyboardAwareScrollViewCompat({
  children,
  bottomOffset = 0,
  keyboardShouldPersistTaps = "handled",
  style,
  ...props
}: Props) {
  const mergedStyle = StyleSheet.flatten([{ flex: 1 }, style]);
  if (Platform.OS === "web") {
    return (
      <ScrollView
        style={mergedStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="interactive"
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      style={mergedStyle}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="interactive"
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
