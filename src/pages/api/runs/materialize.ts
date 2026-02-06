// pages/api/runs/materialize.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

function requireRunner(req: NextApiRequest) {
  const got = req.headers["x-runner-token"];
  const want = process.env.RUNNER_SHARED_SECRET;
  if (!want) throw new Error("RUNNER_SHARED_SECRET missing");
  return got === want;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  if (!requireRunner(req)) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  const programHash = req.query.programHash as string;
  if (!runId || !programHash) return res.status(400).send("Missing runId/programHash");

  const pinned = await db
    .select({
      runProgramHash: schema.runs.programHash,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  if (!pinned[0]?.runProgramHash) return res.status(409).send("Run not compiled");
  if (pinned[0].runProgramHash !== programHash) return res.status(409).send("Program hash mismatch");

  const perms = await db
    .select({ capability: schema.runPermissions.capability, scope: schema.runPermissions.scope })
    .from(schema.runPermissions)
    .where(eq(schema.runPermissions.runId, runId as any));

  const files = await db
    .select({
      contentRef: schema.runFiles.contentRef,
      path: schema.runFiles.path,
      mode: schema.runFiles.mode,
      sha256: schema.runFiles.sha256,
      mime: schema.runFiles.mime,
      size: schema.runFiles.size,
    })
    .from(schema.runFiles)
    .where(eq(schema.runFiles.runId, runId as any));

  const toolAllowlist = perms
    .filter((p) => p.capability === "tools.use" && p.scope)
    .map((p) => p.scope!)
    .sort();

  return res.status(200).json({
    ok: true,
    manifest: {
      runId,
      programHash,
      toolAllowlist,
      capabilities: perms.map((p) => p.capability).sort(),
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    },
  });
}