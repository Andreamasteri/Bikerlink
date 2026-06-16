import React from "react";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";

// ─────────────────────────────────── types ────────────────────────────────────

export type CheckStatus = "ok" | "warn" | "error";
export type OverallStatus = "ok" | "degraded" | "broken";

export interface PipelineStep {
  name: string;
  status: CheckStatus;
  durationMs: number;
  message?: string;
}

export interface PipelineResult {
  pipeline: string;
  label: string;
  overall: OverallStatus;
  steps: PipelineStep[];
  suggestedFix: string | null;
  durationMs: number;
}

export interface PipelineRunResult {
  runId: string;
  scope: string;
  overall: OverallStatus;
  pipelines: PipelineResult[];
  triggeredBy: string;
  generatedAt: string;
  durationMs: number;
}

export interface PipelineHole {
  id: string;
  pipeline: string;
  traceId: string;
  lastCheckpoint: string;
  ageMs: number;
  detectedAt: string;
  resolved: boolean;
}

export interface HolesResult {
  active: PipelineHole[];
  recent: PipelineHole[];
}

export interface DiagnosticReport {
  id: string;
  userId?: string | null;
  appVersion?: string | null;
  platform?: string | null;
  runAt: string;
  summary?: { totalTests: number; passed: number; failed: number } | null;
}

// ─────────────────────────────────── helpers ──────────────────────────────────

export async function adminFetch(path: string, opts?: RequestInit): Promise<Response> {
  const url = new URL(path, getApiUrl()).toString();
  const headers = { ...(await authFetchHeaders()), ...(opts?.headers ?? {}) };
  return fetch(url, { ...opts, headers, credentials: "include" });
}

export function overallColor(s: OverallStatus | "unknown"): string {
  if (s === "ok") return "#22c55e";
  if (s === "degraded") return "#f59e0b";
  if (s === "broken") return "#ef4444";
  return Colors.textSecondary;
}

export function statusColor(s: CheckStatus | "unknown"): string {
  if (s === "ok") return "#22c55e";
  if (s === "warn") return "#f59e0b";
  if (s === "error") return "#ef4444";
  return Colors.textSecondary;
}

export function overallIcon(s: OverallStatus): React.ReactNode {
  if (s === "ok") return <Ionicons name="checkmark-circle" size={20} color="#22c55e" />;
  if (s === "degraded") return <Ionicons name="warning" size={20} color="#f59e0b" />;
  return <Ionicons name="close-circle" size={20} color="#ef4444" />;
}

export function ageLabel(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}gg`;
}

export function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  return ageLabel(d);
}
