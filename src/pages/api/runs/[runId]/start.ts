import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendRunEvent } from "@/lib/sse";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { Connection, Client, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { PROSE_RUN_WORKFLOW_NAME, PROSE_TASK_QUEUE, proseWorkflowId } from "@/worker/names";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  // load run
  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      temporalWorkflowId: schema.runs.temporalWorkflowId,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  if (!runRow[0]) return res.status(404).send("Run not found");

  // membership check
  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, runRow[0].workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  // ensure program exists (keep as-is for now)
  const existingProgram = await db
    .select({ runId: schema.runPrograms.runId })
    .from(schema.runPrograms)
    .where(eq(schema.runPrograms.runId, runId as any))
    .limit(1);

  if (!existingProgram[0]) {
    await db.insert(schema.runPrograms).values({
      runId: runId as any,
      programText: `# demo.prose\nsession "Fake session"\noutput done = "ok"\n`,
      programSource: "generated",
    });
  }

  // RUN_CREATED only once
  const alreadyCreated = await db
    .select({ id: schema.runEvents.id })
    .from(schema.runEvents)
    .where(and(eq(schema.runEvents.runId, runId as any), eq(schema.runEvents.type, "RUN_CREATED")))
    .limit(1);

  if (!alreadyCreated[0]) {
    await appendRunEvent(runId, "RUN_CREATED", { runId });
  }

  // set queued before starting (idempotent)
  await db
    .update(schema.runs)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(schema.runs.id, runId as any));

  // don't overwrite workflow id if already set
  const workflowId = runRow[0].temporalWorkflowId ?? proseWorkflowId(runId);

  if (!runRow[0].temporalWorkflowId) {
    await db
      .update(schema.runs)
      .set({ temporalWorkflowId: workflowId })
      .where(eq(schema.runs.id, runId as any));
  }
  console.log("TEMPORAL_ADDRESS =", process.env.TEMPORAL_ADDRESS);
  console.log("TEMPORAL_NAMESPACE =", process.env.TEMPORAL_NAMESPACE);
  console.log("TEMPORAL_TASK_QUEUE =", process.env.TEMPORAL_TASK_QUEUE);
  
  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS! });
  const client = new Client({
    connection: conn,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });

  try {
    await client.workflow.start(PROSE_RUN_WORKFLOW_NAME, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? PROSE_TASK_QUEUE,
      workflowId,
      args: [{ runId }],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }

  return res.status(200).json({ ok: true, workflowId });
}