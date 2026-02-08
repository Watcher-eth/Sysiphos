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

  const commentId = req.query.commentId as string;
  if (!commentId) return res.status(400).send("Missing commentId");

  const commentRow = await db
    .select({
      id: schema.comments.id,
      runId: schema.comments.runId,
      authorUserId: schema.comments.authorUserId,
      targetType: schema.comments.targetType,
      targetId: schema.comments.targetId,
      body: schema.comments.body,
      createdAt: schema.comments.createdAt,
      workspaceId: schema.comments.workspaceId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId as any))
    .limit(1);

  const comment = commentRow[0];
  if (!comment) return res.status(404).send("comment_not_found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, comment.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  const { workspaceId, ...rest } = comment;
  return res.status(200).json({ ok: true, comment: rest });
}
