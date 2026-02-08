import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function resolveWorkspaceId(userId: string, workspaceId?: string | null) {
  if (workspaceId) {
    const member = await db
      .select({ workspaceId: schema.workspaceMembers.workspaceId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, userId as any));
    if (!member.find((m) => m.workspaceId === workspaceId)) return null;
    return workspaceId;
  }

  const member = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId as any))
    .limit(1);
  return member[0]?.workspaceId ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const workspaceId = await resolveWorkspaceId(userId, (req.query.workspaceId as string) ?? null);
  if (!workspaceId) return res.status(403).send("Forbidden");

  const taskId = (req.query.taskId as string | undefined) ?? undefined;
  const workflowVersionId = (req.query.workflowVersionId as string | undefined) ?? undefined;
  const status = (req.query.status as string | undefined) ?? undefined;

  const conditions = [
    eq(schema.runs.workspaceId, workspaceId as any),
    ...(taskId ? [eq(schema.runs.taskId, taskId as any)] : []),
    ...(workflowVersionId ? [eq(schema.runs.workflowVersionId, workflowVersionId as any)] : []),
    ...(status ? [eq(schema.runs.status, status as any)] : []),
  ];

  const runs = await db
    .select({
      id: schema.runs.id,
      status: schema.runs.status,
      title: schema.runs.title,
      description: schema.runs.description,
      taskId: schema.runs.taskId,
      workflowVersionId: schema.runs.workflowVersionId,
      programHash: schema.runs.programHash,
      compilerVersion: schema.runs.compilerVersion,
      createdAt: schema.runs.createdAt,
      updatedAt: schema.runs.updatedAt,
    })
    .from(schema.runs)
    .where(and(...(conditions as any)));

  return res.status(200).json({ ok: true, runs });
}
