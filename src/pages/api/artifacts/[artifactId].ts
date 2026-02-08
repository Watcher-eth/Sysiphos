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

  const artifactId = req.query.artifactId as string;
  if (!artifactId) return res.status(400).send("Missing artifactId");

  const artifactRow = await db
    .select({
      id: schema.artifacts.id,
      runId: schema.artifacts.runId,
      type: schema.artifacts.type,
      title: schema.artifacts.title,
      deliverableKey: schema.artifacts.deliverableKey,
      contentRef: schema.artifacts.contentRef,
      sha256: schema.artifacts.sha256,
      mime: schema.artifacts.mime,
      size: schema.artifacts.size,
      createdBy: schema.artifacts.createdBy,
      createdAt: schema.artifacts.createdAt,
      workspaceId: schema.runs.workspaceId,
    })
    .from(schema.artifacts)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.artifacts.runId))
    .where(eq(schema.artifacts.id, artifactId as any))
    .limit(1);

  const artifact = artifactRow[0];
  if (!artifact) return res.status(404).send("artifact_not_found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, artifact.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  const { workspaceId, ...rest } = artifact;
  return res.status(200).json({ ok: true, artifact: rest });
}
