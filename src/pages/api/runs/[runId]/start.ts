import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ExecutionSpec = {
  mcpServers?: Record<string, any>;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;
  enableToolSearch?: string;
  env?: Record<string, string>;
  limits?: { wallClockMs?: number; maxFileBytes?: number; maxArtifactBytes?: number };
};

function sanitizeExecutionSpec(v: unknown): ExecutionSpec {
  if (!v || typeof v !== "object") return {};
  const o = v as any;

  const out: ExecutionSpec = {};

  if (o.mcpServers && typeof o.mcpServers === "object") out.mcpServers = o.mcpServers;
  if (Array.isArray(o.allowedTools)) out.allowedTools = o.allowedTools.map(String);
  if (Array.isArray(o.disallowedTools)) out.disallowedTools = o.disallowedTools.map(String);
  if (typeof o.permissionMode === "string") out.permissionMode = o.permissionMode;
  if (typeof o.enableToolSearch === "string") out.enableToolSearch = o.enableToolSearch;
  if (o.env && typeof o.env === "object") out.env = o.env;
  if (o.limits && typeof o.limits === "object") {
    out.limits = {
      wallClockMs: o.limits.wallClockMs != null ? Number(o.limits.wallClockMs) : undefined,
      maxFileBytes: o.limits.maxFileBytes != null ? Number(o.limits.maxFileBytes) : undefined,
      maxArtifactBytes: o.limits.maxArtifactBytes != null ? Number(o.limits.maxArtifactBytes) : undefined,
    };
  }

  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const { taskId, executionSpec } = (req.body ?? {}) as {
    taskId?: string;
    executionSpec?: unknown;
  };

  const member = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId as any))
    .limit(1);

  if (!member[0]) return res.status(400).send("No workspace");

  let taskExec: any = {};
  if (taskId) {
    const t = await db
      .select({
        id: schema.tasks.id,
        workspaceId: schema.tasks.workspaceId,
        executionSpec: (schema.tasks as any).executionSpec,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId as any))
      .limit(1);

    if (!t[0]) return res.status(404).send("task_not_found");
    if (t[0].workspaceId !== member[0].workspaceId) return res.status(403).send("task_wrong_workspace");
    taskExec = t[0].executionSpec ?? {};
  }

  const pinnedExec = sanitizeExecutionSpec(executionSpec ?? taskExec ?? {});

  const created = await db
    .insert(schema.runs)
    .values({
      workspaceId: member[0].workspaceId,
      sourceType: taskId ? "task" : "manual",
      taskId: taskId ? (taskId as any) : null,
      status: "queued",
      title: "Script run",
      description: "",
      createdByUserId: userId as any,
      executionSpec: pinnedExec as any,
    } as any)
    .returning({ id: schema.runs.id });

  return res.status(200).json({ ok: true, runId: created[0]!.id });
}