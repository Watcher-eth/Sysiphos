import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
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
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  if (req.method === "GET") {
    const workspaceId = await resolveWorkspaceId(userId, (req.query.workspaceId as string) ?? null);
    if (!workspaceId) return res.status(403).send("Forbidden");

    const workflows = await db
      .select({
        id: schema.workflows.id,
        name: schema.workflows.name,
        description: schema.workflows.description,
        createdAt: schema.workflows.createdAt,
        updatedAt: schema.workflows.updatedAt,
      })
      .from(schema.workflows)
      .where(eq(schema.workflows.workspaceId, workspaceId as any));

    return res.status(200).json({ ok: true, workflows });
  }

  if (req.method === "POST") {
    const workspaceId = await resolveWorkspaceId(userId, (req.body?.workspaceId as string) ?? null);
    if (!workspaceId) return res.status(403).send("Forbidden");

    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).send("name_required");

    const description = String(req.body?.description ?? "");

    const created = await db
      .insert(schema.workflows)
      .values({
        workspaceId: workspaceId as any,
        name,
        description,
        createdByUserId: userId as any,
      } as any)
      .returning({ id: schema.workflows.id });

    return res.status(200).json({ ok: true, workflowId: created[0]!.id });
  }

  return res.status(405).end();
}
