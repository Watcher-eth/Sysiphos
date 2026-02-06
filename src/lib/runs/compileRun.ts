// src/lib/runs/compileRun.ts
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { compileToProse } from "@/lib/prose/proseCompiler";

export async function compileAndPinRun(opts: { runId: string; userId: string }) {
  const { runId, userId } = opts;

  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      sourceType: schema.runs.sourceType,
      taskId: schema.runs.taskId,
      workflowVersionId: schema.runs.workflowVersionId,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const run = runRow[0];
  if (!run) return { ok: false as const, status: 404 as const, error: "Run not found" };

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, run.workspaceId), eq(schema.workspaceMembers.userId, userId as any)))
    .limit(1);

  if (!membership[0]) return { ok: false as const, status: 403 as const, error: "Forbidden" };

  let compileInput: Parameters<typeof compileToProse>[0];

  if (run.sourceType === "task") {
    if (!run.taskId) return { ok: false as const, status: 400 as const, error: "run_missing_task" };

    const tRow = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        description: schema.tasks.description,
        deliverablesSpec: schema.tasks.deliverablesSpec,
        contextSpec: schema.tasks.contextSpec,
        mountsSpec: schema.tasks.mountsSpec,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, run.taskId))
      .limit(1);

    const task = tRow[0];
    if (!task) return { ok: false as const, status: 404 as const, error: "task_not_found" };

    compileInput = {
      kind: "task",
      task: {
        id: task.id as any,
        title: task.title,
        description: task.description ?? "",
        deliverablesSpec: (task.deliverablesSpec as any[]) ?? [],
        contextSpec: (task.contextSpec as any[]) ?? [],
        mountsSpec: (task.mountsSpec as any[]) ?? [],
      },
    };
  } else {
    if (!run.workflowVersionId) return { ok: false as const, status: 400 as const, error: "run_missing_workflow_version" };

    const wvRow = await db
      .select({
        id: schema.workflowVersions.id,
        workflowId: schema.workflowVersions.workflowId,
        version: schema.workflowVersions.version,
        definition: schema.workflowVersions.definition,
      })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, run.workflowVersionId))
      .limit(1);

    const wv = wvRow[0];
    if (!wv) return { ok: false as const, status: 404 as const, error: "workflow_version_not_found" };

    compileInput = {
      kind: "workflow_version",
      workflowVersion: {
        id: wv.id as any,
        workflowId: wv.workflowId as any,
        version: wv.version,
        definition: wv.definition,
      },
    };
  }

  const compiled = compileToProse(compileInput);

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.runPrograms)
      .values({
        runId: runId as any,
        compilerVersion: compiled.compilerVersion,
        sourceHash: compiled.sourceHash,
        programText: compiled.programText,
        programSource: "generated",
        programHash: compiled.programHash,
      } as any)
      // @ts-ignore
      .onConflictDoUpdate({
        target: [schema.runPrograms.runId],
        set: {
          compilerVersion: compiled.compilerVersion,
          sourceHash: compiled.sourceHash,
          programText: compiled.programText,
          programSource: "generated",
          programHash: compiled.programHash,
        },
      });

    await tx
      .update(schema.runs)
      .set({
        compilerVersion: compiled.compilerVersion,
        programHash: compiled.programHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, runId as any));
  });

  return { ok: true as const, compiled };
}