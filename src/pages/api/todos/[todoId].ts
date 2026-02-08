import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VALID_STATUSES = new Set(["pending", "in_progress", "completed"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const todoId = req.query.todoId as string;
  if (!todoId) return res.status(400).send("Missing todoId");

  const todoRow = await db
    .select({
      id: schema.todos.id,
      runId: schema.todos.runId,
      workspaceId: schema.runs.workspaceId,
    })
    .from(schema.todos)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.todos.runId))
    .where(eq(schema.todos.id, todoId as any))
    .limit(1);

  const todo = todoRow[0];
  if (!todo) return res.status(404).send("todo_not_found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, todo.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  const status = req.body?.status != null ? String(req.body.status) : undefined;
  if (status != null && !VALID_STATUSES.has(status)) {
    return res.status(400).send("invalid_status");
  }

  const text = req.body?.text != null ? String(req.body.text) : undefined;
  const description = req.body?.description != null ? String(req.body.description) : undefined;
  const order = req.body?.order != null ? Number(req.body.order) : undefined;

  await db
    .update(schema.todos)
    .set({
      ...(status != null ? { status: status as any } : {}),
      ...(text != null ? { text } : {}),
      ...(description != null ? { description } : {}),
      ...(order != null ? { order } : {}),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.todos.id, todoId as any));

  return res.status(200).json({ ok: true });
}
