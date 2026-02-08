import type { NextApiRequest, NextApiResponse } from "next";
import { and, desc, eq } from "drizzle-orm";
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
    .select({ workspaceId: schema.runs.workspaceId })
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

  const fileOps = await db
    .select({
      id: schema.runFileOps.id,
      runId: schema.runFileOps.runId,
      op: schema.runFileOps.op,
      path: schema.runFileOps.path,
      beforeContentRef: schema.runFileOps.beforeContentRef,
      afterContentRef: schema.runFileOps.afterContentRef,
      checkpointId: schema.runFileOps.checkpointId,
      toolName: schema.runFileOps.toolName,
      toolUseId: schema.runFileOps.toolUseId,
      createdAt: schema.runFileOps.createdAt,
      payload: schema.runFileOps.payload,
    })
    .from(schema.runFileOps)
    .where(eq(schema.runFileOps.runId, runId as any))
    .orderBy(desc(schema.runFileOps.createdAt));

  return res.status(200).json({ ok: true, fileOps });
}
