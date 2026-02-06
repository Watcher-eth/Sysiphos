// worker/src/activities.ts
import { eq, max, and } from "drizzle-orm";
import { db, schema } from "../../src/lib/db";
import { spawnRunnerSession } from "./runnerClient";

async function nextSeq(runId: string): Promise<number> {
  const row = await db
    .select({ m: max(schema.runEvents.seq) })
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId as any));

  return (row[0]?.m ?? 0) + 1;
}

export async function writeEvent(args: { runId: string; type: schema.RunEventType; payload: any }) {
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

async function upsertContentBlob(args: { contentRef: string; sha256?: string; size?: number; mime?: string }) {
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

// ✅ This is the Temporal activity signature
export async function SpawnSessionAndWait(args: { runId: string; programHash: string }) {
  const resp = await spawnRunnerSession({ runId: args.runId, programHash: args.programHash, agentType: "mock" });

  await db.insert(schema.agentSessions).values({
    runId: args.runId as any,
    runnerSessionId: resp.sessionId,
    agentType: "mock",
    status: resp.status === "succeeded" ? "succeeded" : "failed",
    endedAt: new Date(),
  } as any);

  await writeBinding({
    runId: args.runId,
    name: resp.outputs.bindingName,
    kind: resp.outputs.kind,
    contentRef: resp.outputs.contentRef,
    contentPreview: resp.outputs.preview,
    summary: resp.outputs.summary,
    sha256: resp.outputs.sha256,
    size: resp.outputs.size,
    mime: resp.outputs.mime,
  });

  return resp;
}