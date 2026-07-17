// Minimal react-native stub for vitest (node environment).
// Only the symbols actually used by bowie-client.ts are exported;
// the real react-native uses Flow and cannot be parsed by Rolldown.
export const Platform = {
  OS: "android" as const,
};
