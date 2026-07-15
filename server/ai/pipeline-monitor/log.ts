import { db } from "../../db";
import { pipelineFlowEvents } from "@shared/db";
import { eq, and, lt } from "drizzle-orm";
import crypto from "crypto";

export async function recordCheckpoint(opts: {
  pipeline: string;
  traceId: string;
  checkpoint: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(pipelineFlowEvents).values({
      pipeline: opts.pipeline,
      traceId: opts.traceId,
      checkpoint: opts.checkpoint,
      metaJson: opts.meta ?? null,
      resolved: false,
    });
  } catch {
    // Non-fatal
  }
}

export async function resolveTrace(pipeline: string, traceId: string): Promise<void> {
  try {
    await db
      .update(pipelineFlowEvents)
      .set({ resolved: true })
      .where(
        and(
          eq(pipelineFlowEvents.pipeline, pipeline),
          eq(pipelineFlowEvents.traceId, traceId),
        ),
      );
  } catch {
    // Non-fatal
  }
}

export async function cleanupOldFlowEvents(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result = await db
      .delete(pipelineFlowEvents)
      .where(lt(pipelineFlowEvents.ts, cutoff));
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch {
    return 0;
  }
}

export function generateTraceId(): string {
  return crypto.randomBytes(8).toString("hex");
}
