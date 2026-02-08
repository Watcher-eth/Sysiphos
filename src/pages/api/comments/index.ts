import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  if (req.method === "GET") {
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

    const comments = await db
      .select({
        id: schema.comments.id,
        runId: schema.comments.runId,
        authorUserId: schema.comments.authorUserId,
        targetType: schema.comments.targetType,
        targetId: schema.comments.targetId,
        body: schema.comments.body,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .where(eq(schema.comments.runId, runId as any))
      .orderBy(schema.comments.createdAt);

    return res.status(200).json({ ok: true, comments });
  }

  if (req.method === "POST") {
    const runId = String(req.body?.runId ?? "");
    const targetType = String(req.body?.targetType ?? "");
    const targetId = req.body?.targetId ? String(req.body.targetId) : null;
    const body = String(req.body?.body ?? "").trim();

    if (!runId) return res.status(400).send("run_id_required");
    if (!targetType) return res.status(400).send("target_type_required");
    if (!body) return res.status(400).send("comment_body_required");

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

    const created = await db
      .insert(schema.comments)
      .values({
        workspaceId: run.workspaceId as any,
        runId: runId as any,
        authorUserId: userId as any,
        targetType,
        targetId: targetId as any,
        body,
      } as any)
      .returning({ id: schema.comments.id });

    return res.status(200).json({ ok: true, commentId: created[0]!.id });
  }

  return res.status(405).end();
}
