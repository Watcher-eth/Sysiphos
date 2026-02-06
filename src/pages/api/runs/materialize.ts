// src/pages/api/runs/materialize.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildSpawnManifest } from "@/lib/runs/buildSpawnManifest";

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

  // Ensure pinned program matches requested hash
  const pinned = await db
    .select({ runProgramHash: schema.runs.programHash })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  if (!pinned[0]?.runProgramHash) return res.status(409).send("Run not compiled");
  if (pinned[0].runProgramHash !== programHash) return res.status(409).send("Program hash mismatch");

  const manifest = await buildSpawnManifest({ runId, programHash });

  return res.status(200).json({
    ok: true,
    manifest,
  });
}