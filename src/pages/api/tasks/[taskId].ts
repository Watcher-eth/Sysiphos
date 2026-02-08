import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ToolDefForModel = {
  name: string;
  description?: string;
  input_schema?: any;
};

type ExecutionSpec = {
  tools?: ToolDefForModel[];
  mcpServers?: Record<string, any>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;
  env?: Record<string, string>;
  envAllowlist?: string[];
  limits?: { wallClockMs?: number; maxFileBytes?: number; maxArtifactBytes?: number };
};

function sanitizeExecutionSpec(v: unknown): ExecutionSpec {
  if (!v || typeof v !== "object") return {};
  const o = v as any;

  const out: ExecutionSpec = {};

  if (Array.isArray(o.tools)) {
    out.tools = o.tools
      .filter((t: any) => t && typeof t === "object" && typeof t.name === "string" && t.name.trim())
      .map((t: any) => ({
        name: String(t.name).trim(),
        description: typeof t.description === "string" ? t.description : "",
        input_schema: t.input_schema ?? { type: "object", properties: {}, additionalProperties: false },
      }));
  }

  if (o.mcpServers && typeof o.mcpServers === "object") out.mcpServers = o.mcpServers;
  if (typeof o.permissionMode === "string") out.permissionMode = o.permissionMode;

  if (o.env && typeof o.env === "object") out.env = o.env;
  if (Array.isArray(o.envAllowlist)) out.envAllowlist = o.envAllowlist.map(String).filter(Boolean);

  if (typeof o.enableToolSearch === "string" && o.enableToolSearch.trim()) {
    out.env = { ...(out.env ?? {}), ENABLE_TOOL_SEARCH: String(o.enableToolSearch).trim() };
  }

  if (o.limits && typeof o.limits === "object") {
    out.limits = {
      wallClockMs: o.limits.wallClockMs != null ? Number(o.limits.wallClockMs) : undefined,
      maxFileBytes: o.limits.maxFileBytes != null ? Number(o.limits.maxFileBytes) : undefined,
      maxArtifactBytes: o.limits.maxArtifactBytes != null ? Number(o.limits.maxArtifactBytes) : undefined,
    };
  }

  return out;
}

function requireArray(name: string, v: unknown) {
  if (v == null) return undefined;
  if (!Array.isArray(v)) throw new Error(`${name}_must_be_array`);
  return v;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const taskId = req.query.taskId as string;
  if (!taskId) return res.status(400).send("Missing taskId");

  const taskRow = await db
    .select({
      id: schema.tasks.id,
      workspaceId: schema.tasks.workspaceId,
      title: schema.tasks.title,
      description: schema.tasks.description,
      executionSpec: (schema.tasks as any).executionSpec,
      deliverablesSpec: schema.tasks.deliverablesSpec,
      contextSpec: schema.tasks.contextSpec,
      mountsSpec: schema.tasks.mountsSpec,
      createdAt: schema.tasks.createdAt,
      updatedAt: schema.tasks.updatedAt,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId as any))
    .limit(1);

  const task = taskRow[0];
  if (!task) return res.status(404).send("task_not_found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, task.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, task });
  }

  if (req.method === "PATCH") {
    try {
      const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
      const description = req.body?.description != null ? String(req.body.description) : undefined;

      const deliverablesSpec = requireArray("deliverablesSpec", req.body?.deliverablesSpec);
      const contextSpec = requireArray("contextSpec", req.body?.contextSpec);
      const mountsSpec = requireArray("mountsSpec", req.body?.mountsSpec);

      if (Array.isArray(deliverablesSpec) && deliverablesSpec.length === 0) {
        return res.status(400).send("deliverables_spec_empty");
      }

      const executionSpec =
        req.body?.executionSpec != null ? sanitizeExecutionSpec(req.body?.executionSpec) : undefined;

      await db
        .update(schema.tasks)
        .set({
          ...(title != null ? { title } : {}),
          ...(description != null ? { description } : {}),
          ...(executionSpec != null ? { executionSpec: executionSpec as any } : {}),
          ...(deliverablesSpec != null ? { deliverablesSpec: deliverablesSpec as any } : {}),
          ...(contextSpec != null ? { contextSpec: contextSpec as any } : {}),
          ...(mountsSpec != null ? { mountsSpec: mountsSpec as any } : {}),
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.tasks.id, taskId as any));

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(400).send(String(err?.message ?? "invalid_request"));
    }
  }

  return res.status(405).end();
}
