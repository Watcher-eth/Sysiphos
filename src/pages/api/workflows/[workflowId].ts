import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const workflowId = req.query.workflowId as string;
  if (!workflowId) return res.status(400).send("Missing workflowId");

  const workflowRow = await db
    .select({
      id: schema.workflows.id,
      workspaceId: schema.workflows.workspaceId,
      name: schema.workflows.name,
      description: schema.workflows.description,
      createdAt: schema.workflows.createdAt,
      updatedAt: schema.workflows.updatedAt,
    })
    .from(schema.workflows)
    .where(eq(schema.workflows.id, workflowId as any))
    .limit(1);

  const workflow = workflowRow[0];
  if (!workflow) return res.status(404).send("workflow_not_found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workflow.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, workflow });
  }

  if (req.method === "PATCH") {
    const name = req.body?.name != null ? String(req.body.name).trim() : undefined;
    const description = req.body?.description != null ? String(req.body.description) : undefined;

    if (name !== undefined && !name) return res.status(400).send("name_required");

    await db
      .update(schema.workflows)
      .set({
        ...(name != null ? { name } : {}),
        ...(description != null ? { description } : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.workflows.id, workflowId as any));

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
