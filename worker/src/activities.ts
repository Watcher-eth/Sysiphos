// worker/src/activities.ts (or wherever this file lives)

import { eq, max } from "drizzle-orm";
import { db, schema } from "../../src/lib/db";
import { spawnRunnerSession } from "./runnerClient";
import { settleRunHold } from "../../src/lib/billing/ledger";

async function nextSeq(runId: string): Promise<number> {
  const row = await db
    .select({ m: max(schema.runEvents.seq) })
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId as any));

  return (row[0]?.m ?? 0) + 1;
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
  type: schema.RunEventType;
  payload: any;
}) {
  const seq = await nextSeq(args.runId);
  await db.insert(schema.runEvents).values({
    runId: args.runId as any,
    seq,
    type: args.type,
    payload: args.payload ?? {},
  });
}

export async function setRunStatus(args: { runId: string; status: schema.RunStatus }) {
  await db
    .update(schema.runs)
    .set({ status: args.status, updatedAt: new Date() })
    .where(eq(schema.runs.id, args.runId as any));
}

export async function createTodo(args: { runId: string; text: string; order: number }) {
  const id = crypto.randomUUID();

  await db.insert(schema.todos).values({
    id: id as any,
    runId: args.runId as any,
    text: args.text,
    order: args.order,
    status: "not_started",
  });

  await writeEvent({
    runId: args.runId,
    type: "TODO_CREATED",
    payload: { id, text: args.text, order: args.order },
  });

  return { id };
}

async function upsertContentBlob(args: {
  contentRef: string;
  sha256?: string;
  size?: number;
  mime?: string;
}) {
  await db
    .insert(schema.contentBlobs)
    .values({
      contentRef: args.contentRef,
      sha256: args.sha256,
      size: args.size,
      mime: args.mime,
    } as any)
    // @ts-ignore
    .onConflictDoUpdate({
      target: [schema.contentBlobs.contentRef],
      set: {
        sha256: args.sha256,
        size: args.size,
        mime: args.mime,
      },
    });
}

export async function writeBinding(args: {
  runId: string;
  name: string;
  kind: schema.BindingKind;
  contentRef: string;
  contentPreview?: string;
  summary?: string;
  sha256?: string;
  size?: number;
  mime?: string;
}) {
  await upsertContentBlob({
    contentRef: args.contentRef,
    sha256: args.sha256,
    size: args.size,
    mime: args.mime,
  });

  await db
    .insert(schema.bindings)
    .values({
      runId: args.runId as any,
      name: args.name,
      kind: args.kind,
      executionId: null,
      contentRef: args.contentRef,
      contentPreview: args.contentPreview ?? null,
      summary: args.summary ?? null,
    } as any)
    // @ts-ignore
    .onConflictDoUpdate({
      target: [schema.bindings.runId, schema.bindings.name, schema.bindings.executionId],
      set: {
        contentRef: args.contentRef,
        contentPreview: args.contentPreview ?? null,
        summary: args.summary ?? null,
      },
    });

  await writeEvent({
    runId: args.runId,
    type: "BINDING_WRITTEN",
    payload: { name: args.name, kind: args.kind, contentRef: args.contentRef },
  });
}

// Runner session: spawn + persist session + write bindings.
// (No billing settle here; workflow finally does it.)
export async function SpawnSessionAndWait(args: { runId: string; programHash: string }) {
  const resp = await spawnRunnerSession({
    runId: args.runId,
    programHash: args.programHash,
    agentType: "mock",
  });

  // Idempotent under retries (requires uniq index on (run_id, runner_session_id))
  await db
    .insert(schema.agentSessions)
    .values({
      runId: args.runId as any,
      runnerSessionId: resp.sessionId,
      agentType: "mock",
      status: resp.status === "succeeded" ? "succeeded" : "failed",
      endedAt: new Date(),
    } as any)
    // @ts-ignore
    .onConflictDoNothing({
      target: [schema.agentSessions.runId, schema.agentSessions.runnerSessionId],
    });

  const outputs = Array.isArray(resp.outputs) ? resp.outputs : [];
  for (const o of outputs) {
    await writeBinding({
      runId: args.runId,
      name: o.bindingName,
      kind: o.kind,
      contentRef: o.contentRef,
      contentPreview: o.preview,
      summary: o.summary,
      sha256: o.sha256,
      size: o.size,
      mime: o.mime,
    });
  }

  return resp;
}

export async function settleRunBilling(args: {
  runId: string;
  status: "succeeded" | "failed" | "canceled";
  usage?: { costCredits?: number } | null;
}) {
  const workspaceId = await getRunWorkspaceId(args.runId);

  // Policy: always charge at least 1 unless usage provides cost
  // (If you want canceled to cost 0, change to: args.status === "canceled" ? 0 : ...
  const usageCost = Number(args.usage?.costCredits ?? 1);
  const actualCost = Math.max(0, usageCost);

  const settled = await settleRunHold({
    workspaceId,
    runId: args.runId,
    actualCost,
    reason: `settle_${args.status}`,
  });

  // Optional but recommended: emit an event so UI can show billing reconciliation
  // (Add BILLING_SETTLED to RunEventType if you keep this.)
  try {
    await writeEvent({
      runId: args.runId,
      type: "BILLING_SETTLED" as any,
      payload: {
        status: args.status,
        actualCost,
        ...settled,
      },
    });
  } catch {
    // no-op if event type not added yet
  }
}