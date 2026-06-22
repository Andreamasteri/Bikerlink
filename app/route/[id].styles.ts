import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
  mapWrapper: {
    height: 260,
    borderRadius: 0,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  header: {
    padding: 20,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700" as const,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  dateText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  statCard: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage width string
    width: "31%" as any,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
  statValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700" as const,
    marginTop: 2,
  },
  chartSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chartTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 10,
  },
  chartRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 8,
  },
  chartMeta: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 6,
  },
  chartLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  chartPeak: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  sensorSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sensorSectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 10,
  },
  sensorGrid: {
    flexDirection: "row" as const,
    gap: 8,
  },
  sensorCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center" as const,
    gap: 4,
  },
  sensorValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700" as const,
    marginTop: 4,
  },
  sensorLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    textAlign: "center" as const,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 20,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 8,
  },
  likeText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
