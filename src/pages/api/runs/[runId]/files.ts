import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type RunFileInput = {
  contentRef: string;
  path: string;
  mode?: "ro" | "rw";
  sha256?: string | null;
  mime?: string | null;
  size?: number | null;
};

function normalizeFile(f: RunFileInput): RunFileInput {
  const contentRef = String(f.contentRef ?? "").trim();
  const path = String(f.path ?? "").trim();
  if (!contentRef) throw new Error("content_ref_required");
  if (!path) throw new Error("path_required");
  const mode = f.mode === "rw" ? "rw" : "ro";
  const size = f.size != null && Number.isFinite(Number(f.size)) ? Number(f.size) : null;
  return {
    contentRef,
    path,
    mode,
    sha256: f.sha256 ? String(f.sha256) : null,
    mime: f.mime ? String(f.mime) : null,
    size,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

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

  if (req.method === "GET") {
    const files = await db
      .select({
        id: schema.runFiles.id,
        runId: schema.runFiles.runId,
        contentRef: schema.runFiles.contentRef,
        path: schema.runFiles.path,
        mode: schema.runFiles.mode,
        sha256: schema.runFiles.sha256,
        mime: schema.runFiles.mime,
        size: schema.runFiles.size,
        createdAt: schema.runFiles.createdAt,
      })
      .from(schema.runFiles)
      .where(eq(schema.runFiles.runId, runId as any))
      .orderBy(schema.runFiles.path);

    return res.status(200).json({ ok: true, files });
  }

  if (req.method === "POST") {
    const filesInput = req.body?.files;
    if (!Array.isArray(filesInput) || !filesInput.length) return res.status(400).send("files_required");

    let files: RunFileInput[] = [];
    try {
      files = filesInput.map((f: any) => normalizeFile(f));
    } catch (err: any) {
      return res.status(400).send(String(err?.message ?? "invalid_file"));
    }

    await db
      .insert(schema.runFiles)
      .values(
        files.map((f) => ({
          runId: runId as any,
          contentRef: f.contentRef,
          path: f.path,
          mode: f.mode ?? "ro",
          sha256: f.sha256 ?? null,
          mime: f.mime ?? null,
          size: f.size ?? null,
        })) as any
      )
      .onConflictDoUpdate({
        target: [schema.runFiles.runId, schema.runFiles.path],
        set: {
          contentRef: sql`excluded.${schema.runFiles.contentRef}`,
          mode: sql`excluded.${schema.runFiles.mode}`,
          sha256: sql`excluded.${schema.runFiles.sha256}`,
          mime: sql`excluded.${schema.runFiles.mime}`,
          size: sql`excluded.${schema.runFiles.size}`,
        } as any,
      });

    return res.status(200).json({ ok: true, count: files.length });
  }

  if (req.method === "DELETE") {
    const path = req.body?.path != null ? String(req.body.path).trim() : "";
    const id = req.body?.id != null ? String(req.body.id).trim() : "";
    if (!path && !id) return res.status(400).send("path_or_id_required");

    if (id) {
      await db.delete(schema.runFiles).where(eq(schema.runFiles.id, id as any));
    } else {
      await db
        .delete(schema.runFiles)
        .where(and(eq(schema.runFiles.runId, runId as any), eq(schema.runFiles.path, path as any)));
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
