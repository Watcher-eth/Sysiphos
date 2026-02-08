// src/pages/api/runs/materialize.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildSpawnManifest } from "@/lib/runs/buildSpawnManifest";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const token = req.headers["x-runner-token"];
  if (!token || token !== process.env.RUNNER_SHARED_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  const runId = String(req.query.runId ?? "");
  const programHash = String(req.query.programHash ?? "");
  if (!runId || !programHash) return res.status(400).send("Missing runId/programHash");

  const manifest = await buildSpawnManifest({ runId, programHash });

  return res.status(200).json({ ok: true, manifest });
}