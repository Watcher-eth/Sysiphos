import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  const runRow = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      status: schema.runs.status,
      title: schema.runs.title,
      description: schema.runs.description,
      sourceType: schema.runs.sourceType,
      taskId: schema.runs.taskId,
      workflowVersionId: schema.runs.workflowVersionId,
      executionSpec: (schema.runs as any).executionSpec,
      programHash: schema.runs.programHash,
      compilerVersion: schema.runs.compilerVersion,
      createdAt: schema.runs.createdAt,
      updatedAt: schema.runs.updatedAt,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const run = runRow[0];
  if (!run) return res.status(404).send("Run not found");

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

  return res.status(200).json({ ok: true, run });
}
