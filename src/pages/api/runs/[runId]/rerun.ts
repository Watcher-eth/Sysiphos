// pages/api/runs/[runId]/rerun.ts (or wherever this lives)
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { compileAndPersistRunProgram } from "@/lib/prose/compileRunProgram";

type ToolDefForModel = { name: string; description?: string; input_schema?: any };

type ExecutionSpec = {
    tools?: ToolDefForModel[];
    mcpServers?: Record<string, any>;
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;
  
    env?: Record<string, string>;
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
  
    // env
    if (o.env && typeof o.env === "object") out.env = o.env;
  
    // ✅ migrate old enableToolSearch → env.ENABLE_TOOL_SEARCH
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const parentRunId = req.query.runId as string;
  if (!parentRunId) return res.status(400).send("Missing runId");

  const mode = (req.body?.mode as string | undefined) ?? "latest"; // "latest" | "replay"
  if (mode !== "latest" && mode !== "replay") return res.status(400).send("Invalid mode");

  const parent = await db
    .select({
      id: schema.runs.id,
      workspaceId: schema.runs.workspaceId,
      title: schema.runs.title,
      description: schema.runs.description,
      compilerVersion: schema.runs.compilerVersion,
      programHash: schema.runs.programHash,
      executionSpec: (schema.runs as any).executionSpec,
      taskId: schema.runs.taskId,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, parentRunId as any))
    .limit(1);

  const pr = parent[0];
  if (!pr) return res.status(404).send("Run not found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, pr.workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");
  if (!pr.programHash || !pr.compilerVersion) return res.status(409).send("Parent run not compiled");

  const prog = await db
    .select({
      runId: schema.runPrograms.runId,
      compilerVersion: schema.runPrograms.compilerVersion,
      sourceHash: schema.runPrograms.sourceHash,
      programText: schema.runPrograms.programText,
      programSource: schema.runPrograms.programSource,
      programHash: schema.runPrograms.programHash,
      compilerInputsJson: (schema.runPrograms as any).compilerInputsJson,
    })
    .from(schema.runPrograms)
    .where(eq(schema.runPrograms.runId, parentRunId as any))
    .limit(1);

  const parentProgram = prog[0];
  if (!parentProgram) return res.status(409).send("Parent run_program missing");

  // ✅ choose executionSpec snapshot
  let nextExec: any = pr.executionSpec ?? {};
  if (mode === "latest" && pr.taskId) {
    const t = await db
      .select({ executionSpec: (schema.tasks as any).executionSpec })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, pr.taskId as any))
      .limit(1);

    if (t[0]?.executionSpec) nextExec = t[0].executionSpec;
  }
  const pinnedExec = sanitizeExecutionSpec(nextExec);

  const newRunId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.runs)
      .values({
        workspaceId: pr.workspaceId,
        sourceType: mode === "replay" ? "rerun" : "rerun_latest",
        taskId: pr.taskId ?? null,
        workflowVersionId: null,
        parentRunId: parentRunId as any,
        status: "queued",
        title: pr.title,
        description: pr.description ?? "",
        createdByUserId: userId as any,

        // pin chosen spec snapshot
        executionSpec: pinnedExec as any,

        // for replay we pin immediately; for latest compile will update later
        compilerVersion: mode === "replay" ? pr.compilerVersion : null,
        programHash: mode === "replay" ? pr.programHash : null,
      } as any)
      .returning({ id: schema.runs.id });

    const createdId = String(inserted[0]!.id);

    // ✅ Copy files
    const files = await tx
      .select()
      .from(schema.runFiles)
      .where(eq(schema.runFiles.runId, parentRunId as any));

    if (files.length) {
      await tx.insert(schema.runFiles).values(
        files.map((f: any) => ({
          runId: createdId as any,
          contentRef: f.contentRef,
          path: f.path,
          mode: f.mode,
          sha256: f.sha256,
          mime: f.mime,
          size: f.size,
        }))
      );
    }

    // ✅ Copy permissions (toolAllowlist, etc)
    const perms = await tx
      .select()
      .from(schema.runPermissions)
      .where(eq(schema.runPermissions.runId, parentRunId as any));

    if (perms.length) {
      await tx.insert(schema.runPermissions).values(
        perms.map((p: any) => ({
          runId: createdId as any,
          capability: p.capability,
          scope: p.scope,
        }))
      );
    }

    // ✅ Only copy run_programs in replay mode
    if (mode === "replay") {
      await tx.insert(schema.runPrograms).values({
        runId: createdId as any,
        compilerVersion: parentProgram.compilerVersion,
        sourceHash: parentProgram.sourceHash,
        programText: parentProgram.programText,
        programSource: parentProgram.programSource,
        programHash: parentProgram.programHash,
        compilerInputsJson: parentProgram.compilerInputsJson ?? "",
      } as any);
    }

    return createdId;
  });

  // ✅ "latest" mode: compile fresh AFTER tx commits
  if (mode === "latest") {
    await compileAndPersistRunProgram({
      runId: newRunId,
      mode: "latest",
    });
  }
  
  return res.status(200).json({ ok: true, runId: newRunId, parentRunId, mode });
}