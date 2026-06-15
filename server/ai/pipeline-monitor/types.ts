export type PipelineCheckStatus = "ok" | "warn" | "error";
export type PipelineOverallStatus = "ok" | "degraded" | "broken";

export type PipelineName =
  | "telemetry_ride"
  | "telemetry_maps"
  | "matching"
  | "campaigns"
  | "notifications"
  | "ota"
  | "gps"
  | "embedding_bio"
  | "embedding_music"
  | "chat"
  | "road_hazards"
  | "ai_assistant"
  | "session_crash";

export interface PipelineCheckStep {
  name: string;
  status: PipelineCheckStatus;
  durationMs: number;
  message?: string;
}

export interface PipelineCheckResult {
  pipeline: PipelineName;
  label: string;
  overall: PipelineOverallStatus;
  steps: PipelineCheckStep[];
  suggestedFix: string | null;
  durationMs: number;
}

export interface PipelineRunResult {
  runId: string;
  scope: PipelineName | "all";
  overall: PipelineOverallStatus;
  pipelines: PipelineCheckResult[];
  triggeredBy: "manual" | "scheduler";
  generatedAt: string;
  durationMs: number;
}

export const PIPELINE_LABELS: Record<PipelineName, string> = {
  telemetry_ride:    "Telemetria Ride",
  telemetry_maps:    "Telemetria Mappe",
  matching:          "Matching Cycle",
  campaigns:         "Campagne",
  notifications:     "Notifiche Push",
  ota:               "OTA Update",
  gps:               "GPS Tracking",
  embedding_bio:     "Embedding Bio",
  embedding_music:   "Embedding Musica",
  chat:              "Chat",
  road_hazards:      "Road Hazards",
  ai_assistant:      "AI Assistant",
  session_crash:     "Session Crash Cleanup",
};
