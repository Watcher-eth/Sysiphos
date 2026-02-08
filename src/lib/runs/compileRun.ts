// src/lib/runs/compileRun.ts
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { compileAndPersistRunProgram } from "@/lib/prose/compileRunProgram";

export async function compileAndPinRun(opts: { runId: string; userId: string }) {
  const { runId, userId } = opts;

  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
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

  const out = await compileAndPersistRunProgram({ runId, mode: "latest" });
  return { ok: true as const, compiled: out.compiled };
}