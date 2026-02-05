// src/app/api/runs/[runId]/start/route.ts
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendRunEvent } from "@/lib/sse";

// Temporal client lives in /worker, but your Next app needs a lightweight client.
// For Phase 1, we’ll call the worker via Temporal directly (recommended) or via HTTP to a “control plane”.
// Here: direct Temporal client (requires temporal client deps in app).
import { Connection, Client } from "@temporalio/client";
import { ProseRunWorkflow } from "@/worker/workflows"; // adjust import if you prefer a package boundary

export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;

  const run = await db.select().from(schema.runs).where(eq(schema.runs.id, runId as any)).limit(1);
  if (!run[0]) return new Response("Run not found", { status: 404 });

  // Ensure there is a program record (dummy for now)
  const existingProgram = await db.select().from(schema.runPrograms).where(eq(schema.runPrograms.runId, runId as any));
  if (!existingProgram[0]) {
    await db.insert(schema.runPrograms).values({
      runId: runId as any,
      programText: `# demo.prose\n# Phase 1 skeleton\nsession "Fake session"\noutput done = "ok"\n`,
      programSource: "generated",
    });
  }

  await appendRunEvent(runId, "RUN_CREATED", { runId });

  // Start Temporal workflow
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS! });
  const client = new Client({ connection: conn, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" });

  const workflowId = `prose-run:${runId}`;
  await db
    .update(schema.runs)
    .set({ temporalWorkflowId: workflowId })
    .where(eq(schema.runs.id, runId as any));

  await client.workflow.start(ProseRunWorkflow, {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "prose",
    workflowId,
    args: [{ runId }],
  });

  return Response.json({ ok: true, workflowId });
}