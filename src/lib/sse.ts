// src/lib/sse.ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function appendRunEvent(runId: string, type: schema.RunEventType, payload: any) {
  const last = await db
    .select({ seq: schema.runEvents.seq })
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId as any))
    .orderBy(desc(schema.runEvents.seq))
    .limit(1);

  const nextSeq = (last[0]?.seq ?? 0) + 1;

  await db.insert(schema.runEvents).values({
    runId: runId as any,
    seq: nextSeq,
    type,
    payload,
  });

  return nextSeq;
}

export async function upsertBinding(args: {
    runId: string;
    name: string;
    kind: schema.BindingKind;
    executionId?: number | null;
    sourceProse?: string | null;
    contentPreview?: string | null;
    summary?: string | null;
    contentRef?: string | null;
  }) {
    const executionId = args.executionId ?? null;
  
    const whereExecution =
      executionId === null
        ? isNull(schema.bindings.executionId)
        : eq(schema.bindings.executionId, executionId);
  
    const existing = await db
      .select({ id: schema.bindings.id })
      .from(schema.bindings)
      .where(
        and(
          eq(schema.bindings.runId, args.runId as any),
          eq(schema.bindings.name, args.name),
          whereExecution
        )
      )
      .limit(1);
  
    if (existing[0]) {
      await db
        .update(schema.bindings)
        .set({
          kind: args.kind,
          sourceProse: args.sourceProse ?? undefined,
          contentPreview: args.contentPreview ?? undefined,
          summary: args.summary ?? undefined,
          contentRef: args.contentRef ?? undefined,
        })
        .where(eq(schema.bindings.id, existing[0].id));
      return existing[0].id;
    }
  
    const inserted = await db
      .insert(schema.bindings)
      .values({
        runId: args.runId as any,
        name: args.name,
        kind: args.kind,
        executionId,
        sourceProse: args.sourceProse ?? null,
        contentPreview: args.contentPreview ?? null,
        summary: args.summary ?? null,
        contentRef: args.contentRef ?? null,
      })
      .returning({ id: schema.bindings.id });
  
    return inserted[0]!.id;
  }