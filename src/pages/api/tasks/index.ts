import type { NextApiRequest, NextApiResponse } from "next";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
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

    const tasks = await db
      .select({
        id: schema.tasks.id,
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
      .where(eq(schema.tasks.workspaceId, workspaceId as any));

    return res.status(200).json({ ok: true, tasks });
  }

  if (req.method === "POST") {
    const workspaceId = await resolveWorkspaceId(userId, (req.body?.workspaceId as string) ?? null);
    if (!workspaceId) return res.status(403).send("Forbidden");

    try {
      const title = String(req.body?.title ?? "").trim();
      if (!title) return res.status(400).send("title_required");

      const description = String(req.body?.description ?? "");
      const deliverablesSpec = requireArray("deliverablesSpec", req.body?.deliverablesSpec) ?? [];
      const contextSpec = requireArray("contextSpec", req.body?.contextSpec) ?? [];
      const mountsSpec = requireArray("mountsSpec", req.body?.mountsSpec) ?? [];

      if (Array.isArray(req.body?.deliverablesSpec) && deliverablesSpec.length === 0) {
        return res.status(400).send("deliverables_spec_empty");
      }

      const executionSpec = sanitizeExecutionSpec(req.body?.executionSpec ?? {});

      const created = await db
        .insert(schema.tasks)
        .values({
          workspaceId: workspaceId as any,
          title,
          description,
          executionSpec: executionSpec as any,
          deliverablesSpec: deliverablesSpec as any,
          contextSpec: contextSpec as any,
          mountsSpec: mountsSpec as any,
          createdByUserId: userId as any,
        } as any)
        .returning({ id: schema.tasks.id });

      return res.status(200).json({ ok: true, taskId: created[0]!.id });
    } catch (err: any) {
      return res.status(400).send(String(err?.message ?? "invalid_request"));
    }
  }

  return res.status(405).end();
}
