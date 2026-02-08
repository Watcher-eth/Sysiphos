// worker/src/activities.ts
import { eq } from "drizzle-orm";
import { db, schema } from "../../src/lib/db";
import { spawnRunnerSession } from "./runnerClient";
import { settleRunHold } from "../../src/lib/billing/ledger";
import { postWorkerEvents, type WorkerEventEnvelope } from "./eventsClient";

let _workerSeq = 0;
function mkWorkerEvt(args: Omit<WorkerEventEnvelope, "v" | "sourceSeq" | "ts">): WorkerEventEnvelope {
  return {
    v: 1,
    ...args,
    sourceSeq: ++_workerSeq,
    ts: new Date().toISOString(),
  };
}

async function getRunWorkspaceId(runId: string): Promise<string> {
  const row = await db
    .select({ workspaceId: schema.runs.workspaceId })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const ws = row[0]?.workspaceId as any;
  if (!ws) throw new Error("run_missing_workspace");
  return String(ws);
}

export async function writeEvent(args: {
  runId: string;
  programHash: string;
  principalId: string;
  event: any; // AgentEvent-ish (type, etc)
}) {
  await postWorkerEvents({
    runId: args.runId,
    programHash: args.programHash,
    principalId: args.principalId,
    events: [
      mkWorkerEvt({
        runId: args.runId,
        programHash: args.programHash,
        principalId: args.principalId,
        agentName: "temporal",
        sessionId: undefined,
        event: args.event,
      }),
    ],
  });
}

export async function setRunStatus(args: { runId: string; status: schema.RunStatus }) {
  await db
    .update(schema.runs)
    .set({ status: args.status, updatedAt: new Date() })
    .where(eq(schema.runs.id, args.runId as any));
}

export async function createTodo(args: { runId: string; text: string; order: number; externalId?: string }) {
  await db
    .insert(schema.todos)
    .values({
      runId: args.runId as any,
      externalId: args.externalId ?? `wf_t${args.order}`,
      text: args.text,
      order: args.order,
      status: "pending",
    } as any)
    // @ts-ignore
    .onConflictDoNothing({
      target: [schema.todos.runId, schema.todos.externalId],
    });

  return { externalId: args.externalId ?? `wf_t${args.order}` };
}

export async function SpawnSessionAndWait(args: { runId: string; programHash: string }) {
  const agentType = "mock";
  const idempotencyKey = `spawn:${args.runId}:${args.programHash}:${agentType}`;

  const resp = await spawnRunnerSession({
    runId: args.runId,
    programHash: args.programHash,
    agentType,
    idempotencyKey,
  });

  if (!resp?.sessionId) throw new Error("runner_missing_sessionId");

  await db
    .insert(schema.agentSessions)
    .values({
      runId: args.runId as any,
      runnerSessionId: resp.sessionId,
      agentType,
      status: resp.status === "succeeded" ? "succeeded" : "failed",
      endedAt: new Date(),
    } as any)
    // @ts-ignore
    .onConflictDoNothing({
      target: [schema.agentSessions.runnerSessionId],
    });

  // NOTE: bindings are written by runner -> control plane events + S3 in your architecture.
  // If you still want to mirror bindings here, keep your writeBinding() path.

  return resp;
}

export async function settleRunBilling(args: {
  runId: string;
  status: "succeeded" | "failed" | "canceled";
  usage?: { costCredits?: number; totalCostUsd?: number } | null;
}) {
  const workspaceId = await getRunWorkspaceId(args.runId);

  const usdCost = Number(args.usage?.totalCostUsd ?? 0);
  const usageCost = Number(args.usage?.costCredits ?? (usdCost ? Math.ceil(usdCost) : 1));
  const actualCost = Math.max(0, usageCost);

  const settled = await settleRunHold({
    workspaceId,
    runId: args.runId,
    actualCost,
    reason: `settle_${args.status}`,
  });

  // Emit as LOG (or FILE/RESULT/etc) — your mapper will store it
  await writeEvent({
    runId: args.runId,
    programHash: "unknown", // pass real value from workflow (recommended)
    principalId: "system",
    event: {
      type: "log",
      level: "info",
      message: "billing_settled",
      data: { status: args.status, actualCost, ...settled },
    },
  });
}