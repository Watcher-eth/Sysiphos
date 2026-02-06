import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const { taskId } = (req.body ?? {}) as { taskId?: string };

  const member = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId as any))
    .limit(1);

  if (!member[0]) return res.status(400).send("No workspace");


  if (taskId) {
    const t = await db
      .select({ id: schema.tasks.id, workspaceId: schema.tasks.workspaceId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId as any))
      .limit(1);
  
    if (!t[0]) return res.status(404).send("task_not_found");
    if (t[0].workspaceId !== member[0].workspaceId) return res.status(403).send("task_wrong_workspace");
  }
  
  const created = await db
    .insert(schema.runs)
    .values({
        workspaceId: member[0].workspaceId,
        sourceType: "task",
        taskId: taskId ? (taskId as any) : null,
        status: "queued",
        title: "Script run",
        description: "",
        createdByUserId: userId as any,
      })
    .returning({ id: schema.runs.id });

  return res.status(200).json({ ok: true, runId: created[0]!.id });
}