// pages/api/runs/compile.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { compileAndPinRun } from "@/lib/runs/compileRun";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).send("Unauthorized");

  const runId = req.query.runId as string;
  if (!runId) return res.status(400).send("Missing runId");

  const out = await compileAndPinRun({ runId, userId });
  if (!out.ok) return res.status(out.status).send(out.error);

  return res.status(200).json({ ok: true, runId, ...out.compiled });
}