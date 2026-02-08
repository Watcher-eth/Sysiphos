import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, sql } from "drizzle-orm";
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
    const versions = await db
      .select({
        id: schema.workflowVersions.id,
        workflowId: schema.workflowVersions.workflowId,
        version: schema.workflowVersions.version,
        definition: schema.workflowVersions.definition,
        createdAt: schema.workflowVersions.createdAt,
      })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId as any))
      .orderBy(schema.workflowVersions.version);

    return res.status(200).json({ ok: true, versions });
  }

  if (req.method === "POST") {
    const definition = req.body?.definition;
    if (!definition || typeof definition !== "object") {
      return res.status(400).send("definition_required");
    }

    const maxRow = await db
      .select({ maxVersion: sql<number>`max(${schema.workflowVersions.version})` })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId as any));

    const nextVersion = Number(maxRow[0]?.maxVersion ?? 0) + 1;

    const created = await db
      .insert(schema.workflowVersions)
      .values({
        workflowId: workflowId as any,
        version: nextVersion,
        definition: definition as any,
        createdByUserId: userId as any,
      } as any)
      .returning({
        id: schema.workflowVersions.id,
        version: schema.workflowVersions.version,
      });

    return res.status(200).json({ ok: true, workflowVersionId: created[0]!.id, version: created[0]!.version });
  }

  return res.status(405).end();
}
