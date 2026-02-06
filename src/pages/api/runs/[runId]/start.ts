// src/pages/api/runs/[runId]/start.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appendRunEvent } from "@/lib/sse";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import {
  Connection,
  Client,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import {
  PROSE_RUN_WORKFLOW_NAME,
  PROSE_TASK_QUEUE,
  proseWorkflowId,
} from "@/lib/temporal/names";

import { compileAndPinRun } from "@/lib/runs/compileRun";
import { reserveForRun } from "@/lib/billing/ledger";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  // load run (incl workspace for membership check + existing temporal workflow id)
  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      temporalWorkflowId: schema.runs.temporalWorkflowId,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const run = runRow[0];
  if (!run) return res.status(404).send("Run not found");

  // membership check
  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, run.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  // ensure pinned program exists; if missing, compile + pin (idempotent)
  const pinned0 = await db
    .select({
      programHash: schema.runs.programHash,
      compilerVersion: schema.runs.compilerVersion,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  if (!pinned0[0]?.programHash || !pinned0[0]?.compilerVersion) {
    const out = await compileAndPinRun({ runId, userId });
    if (!out.ok) return res.status(out.status).send(out.error);
  }

  // re-read pinned after potential compile
  const pinned = await db
    .select({
      programHash: schema.runs.programHash,
      compilerVersion: schema.runs.compilerVersion,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  if (!pinned[0]?.programHash || !pinned[0]?.compilerVersion) {
    return res.status(500).send("Compile failed to pin program");
  }

  // verify pinned program matches authoritative run_programs row
  const programRow = await db
    .select({
      programHash: schema.runPrograms.programHash,
    })
    .from(schema.runPrograms)
    .where(eq(schema.runPrograms.runId, runId as any))
    .limit(1);

  if (!programRow[0] || programRow[0].programHash !== pinned[0].programHash) {
    return res.status(409).send("Pinned program mismatch. Re-compile.");
  }

  // billing preflight (v1 fixed hold) — idempotent by runId
  const estCost = 1;

  const existingHold = await db
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.workspaceId, run.workspaceId),
        eq(schema.creditLedger.runId, runId as any),
        eq(schema.creditLedger.kind, "hold")
      )
    )
    .limit(1);

  if (!existingHold[0]) {
    const hold = await reserveForRun({
      workspaceId: run.workspaceId as any,
      runId,
      estCost,
      reason: "start_run_hold",
    });

    if (!hold.ok) {
      return res.status(402).json({
        ok: false,
        error: "insufficient_credits",
        balance: hold.balance,
        required: estCost,
      });
    }
  }

  // RUN_CREATED only once
  const alreadyCreated = await db
    .select({ id: schema.runEvents.id })
    .from(schema.runEvents)
    .where(
      and(
        eq(schema.runEvents.runId, runId as any),
        eq(schema.runEvents.type, "RUN_CREATED")
      )
    )
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
  const workflowId = run.temporalWorkflowId ?? proseWorkflowId(runId);

  if (!run.temporalWorkflowId) {
    await db
      .update(schema.runs)
      .set({ temporalWorkflowId: workflowId })
      .where(eq(schema.runs.id, runId as any));
  }

  const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS! });
  const client = new Client({
    connection: conn,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });

  try {
    await client.workflow.start(PROSE_RUN_WORKFLOW_NAME, {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? PROSE_TASK_QUEUE,
      workflowId,
      args: [{ runId, programHash: pinned[0].programHash }],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }

  return res.status(200).json({ ok: true, workflowId });
}