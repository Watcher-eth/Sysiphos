// src/lib/compiler/compileRunProgram.ts
import { and, eq, inArray, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { compileToProse, type ReviewNote, type ExecutionSpec } from "@/lib/prose/proseCompiler";

type CompileMode = "replay" | "latest";

function normalizeReviewNotes(rows: Array<any>): ReviewNote[] {
  return rows
    .map((r) => ({
      id: String(r.id),
      createdAt: new Date(r.createdAt).toISOString(),
      authorUserId: r.authorUserId ? String(r.authorUserId) : null,
      targetType: String(r.targetType ?? ""),
      targetId: r.targetId ? String(r.targetId) : null,
      body: String(r.body ?? ""),
      runId: String(r.runId),
    }))
    .sort((a, b) => {
      const t = a.createdAt.localeCompare(b.createdAt);
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });
}


export async function compileAndPersistRunProgram(params: {
  runId: string;
  mode: CompileMode;
  compilerVersion?: string;
}) {
  const compilerVersion = params.compilerVersion ?? "prose-compiler@0.1.0"; // or read from env/const
  const { runId, mode } = params;

  // 1) load run
  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      sourceType: schema.runs.sourceType,
      taskId: schema.runs.taskId,
      workflowVersionId: schema.runs.workflowVersionId,
      executionSpec: (schema.runs as any).executionSpec,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const run = runRow[0];
  if (!run) throw new Error("run_not_found");

  const taskId = run.taskId ? String(run.taskId) : null;

  // 2) decide “effective executionSpec”
  // latest: prefer task.executionSpec, else run.executionSpec
  // replay: always use run.executionSpec (it was pinned at creation)
  let effectiveExecutionSpec: ExecutionSpec = (run.executionSpec ?? {}) as any;
  if (mode === "latest" && taskId) {
    const t = await db
      .select({
        executionSpec: (schema.tasks as any).executionSpec,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId as any))
      .limit(1);
    if (t[0]?.executionSpec) effectiveExecutionSpec = t[0].executionSpec as any;
  }

  // 3) collect review notes (task-scoped)
  let reviewNotes: ReviewNote[] = [];
  if (taskId) {
    const taskRuns = await db.select({ id: schema.runs.id }).from(schema.runs).where(eq(schema.runs.taskId, taskId as any));
    const runIds = taskRuns.map((r) => r.id);

    if (runIds.length) {
      const comments = await db
        .select({
          id: schema.comments.id,
          runId: schema.comments.runId,
          authorUserId: schema.comments.authorUserId,
          targetType: schema.comments.targetType,
          targetId: schema.comments.targetId,
          body: schema.comments.body,
          createdAt: schema.comments.createdAt,
        })
        .from(schema.comments)
        .where(inArray(schema.comments.runId, runIds as any))
        .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));

      // OPTIONAL: restrict to review comments only (recommended)
      // e.g. body starts with "[review]" or targetType === "run"
      const filtered = comments.filter((c) => String(c.body ?? "").trim().length > 0);

      reviewNotes = normalizeReviewNotes(filtered);
    }
  }

  // 4) build compiler input snapshot
  let compileInput: Parameters<typeof compileToProse>[0];

  if (run.sourceType === "task") {
    if (!taskId) throw new Error("run_missing_task");

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
      .where(eq(schema.tasks.id, taskId as any))
      .limit(1);

    const task = tRow[0];
    if (!task) throw new Error("task_not_found");
    const deliverablesSpecArr = (task.deliverablesSpec as any[]) ?? [];
    if (!deliverablesSpecArr.length) throw new Error("task_missing_deliverables");

    compileInput = {
      kind: "task",
      task: {
        id: String(task.id),
        title: String(task.title ?? ""),
        description: String(task.description ?? ""),
        deliverablesSpec: deliverablesSpecArr,
        contextSpec: (task.contextSpec as any[]) ?? [],
        mountsSpec: (task.mountsSpec as any[]) ?? [],
      },
      reviewNotes,
      executionSpec: effectiveExecutionSpec,
    };
  } else {
    if (!run.workflowVersionId) throw new Error("run_missing_workflow_version");

    const wvRow = await db
      .select({
        id: schema.workflowVersions.id,
        workflowId: schema.workflowVersions.workflowId,
        version: schema.workflowVersions.version,
        definition: schema.workflowVersions.definition,
      })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, run.workflowVersionId as any))
      .limit(1);

    const wv = wvRow[0];
    if (!wv) throw new Error("workflow_version_not_found");

    compileInput = {
      kind: "workflow_version",
      workflowVersion: {
        id: String(wv.id),
        workflowId: String(wv.workflowId),
        version: Number(wv.version),
        definition: wv.definition,
      },
      reviewNotes,
      executionSpec: effectiveExecutionSpec,
    };
  }

  // 5) compile
  const compiled = compileToProse(compileInput);

  // 6) persist (upsert)
  await db
    .insert(schema.runPrograms)
    .values({
      runId: runId as any,
      compilerVersion: compiled.compilerVersion,
      sourceHash: compiled.sourceHash,
      programText: compiled.programText,
      programSource: "generated",
      programHash: compiled.programHash,
      compilerInputsJson: compiled.compilerInputsJson,
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
        compilerInputsJson: compiled.compilerInputsJson,
      } as any,
    });

  await db
    .update(schema.runs)
    .set({
      compilerVersion: compiled.compilerVersion,
      programHash: compiled.programHash,
      updatedAt: new Date() as any,
    } as any)
    .where(eq(schema.runs.id, runId as any));

  return { ok: true as const, compiled };
}