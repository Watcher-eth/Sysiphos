// src/pages/api/runs/[runId]/cancel.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Connection, Client } from "@temporalio/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  const runRow = await db
    .select({
      workspaceId: schema.runs.workspaceId,
      temporalWorkflowId: schema.runs.temporalWorkflowId,
      status: schema.runs.status,
    })
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

  if (run.temporalWorkflowId) {
    const conn = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS! });
    const client = new Client({
      connection: conn,
      namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    });
    await client.workflow.getHandle(run.temporalWorkflowId).cancel();
  }

  await db
    .update(schema.runs)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(schema.runs.id, runId as any));

  return res.status(200).json({ ok: true });
}