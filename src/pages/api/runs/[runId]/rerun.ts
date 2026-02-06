// src/pages/api/runs/[runId]/rerun.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const parentRunId = req.query.runId as string;
  if (!parentRunId) return res.status(400).send("Missing runId");

  const parent = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      title: schema.runs.title,
      description: schema.runs.description,
      compilerVersion: schema.runs.compilerVersion,
      programHash: schema.runs.programHash,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, parentRunId as any))
    .limit(1);

  const pr = parent[0];
  if (!pr) return res.status(404).send("Run not found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, pr.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  if (!pr.programHash || !pr.compilerVersion) {
    return res.status(409).send("Parent run not compiled");
  }

  const prog = await db
    .select()
    .from(schema.runPrograms)
    .where(eq(schema.runPrograms.runId, parentRunId as any))
    .limit(1);

  const parentProgram = prog[0];
  if (!parentProgram) return res.status(409).send("Parent run_program missing");

  const created = await db.transaction(async (tx) => {
    const newRun = await tx
      .insert(schema.runs)
      .values({
        workspaceId: pr.workspaceId,
        sourceType: "rerun",
        taskId: null,
        workflowVersionId: null,
        parentRunId: parentRunId as any,
        status: "queued",
        title: pr.title,
        description: pr.description ?? "",
        createdByUserId: userId as any,
        compilerVersion: pr.compilerVersion,
        programHash: pr.programHash,
      } as any)
      .returning({ id: schema.runs.id });

    const newRunId = String(newRun[0]!.id);

    // Copy run_programs (authoritative)
    await tx.insert(schema.runPrograms).values({
      runId: newRunId as any,
      compilerVersion: parentProgram.compilerVersion,
      sourceHash: parentProgram.sourceHash,
      programText: parentProgram.programText,
      programSource: parentProgram.programSource,
      programHash: parentProgram.programHash,
    } as any);

    // Copy run_files
    const files = await tx
      .select()
      .from(schema.runFiles)
      .where(eq(schema.runFiles.runId, parentRunId as any));

    if (files.length) {
      await tx.insert(schema.runFiles).values(
        files.map((f: any) => ({
          runId: newRunId as any,
          contentRef: f.contentRef,
          path: f.path,
          mode: f.mode,
          sha256: f.sha256,
          mime: f.mime,
          size: f.size,
        }))
      );
    }

    // Copy run_permissions
    const perms = await tx
      .select()
      .from(schema.runPermissions)
      .where(eq(schema.runPermissions.runId, parentRunId as any));

    if (perms.length) {
      await tx.insert(schema.runPermissions).values(
        perms.map((p: any) => ({
          runId: newRunId as any,
          capability: p.capability,
          scope: p.scope,
        }))
      );
    }

    return newRunId;
  });

  return res.status(200).json({ ok: true, runId: created, parentRunId });
}