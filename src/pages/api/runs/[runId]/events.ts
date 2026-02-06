import type { NextApiRequest, NextApiResponse } from "next";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function sseEncode(event: { type: string; data: any; id?: string | number }) {
  let out = "";
  if (event.id !== undefined) out += `id: ${event.id}\n`;
  out += `event: ${event.type}\n`;
  out += `data: ${JSON.stringify(event.data)}\n\n`; // <-- must be double newline
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

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

  if (!runRow[0]) return res.status(404).send("Run not found");

  const membership = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, runRow[0].workspaceId),
        eq(schema.workspaceMembers.userId, userId as any)
      )
    )
    .limit(1);

  if (!membership[0]) return res.status(403).send("Forbidden");

  const after = Number((req.query.after as string) ?? "0");
  let last = Number.isFinite(after) ? after : 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  (res as any).flushHeaders?.();

  // Helps some proxies; harmless locally
  res.write(`retry: 1000\n\n`);
  res.write(`: connected\n\n`);
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15_000);

  let polling = false;
  const poll = setInterval(async () => {
    if (polling) return;
    polling = true;

    try {
      const rows = await db
        .select()
        .from(schema.runEvents)
        .where(and(eq(schema.runEvents.runId, runId as any), gt(schema.runEvents.seq, last)))
        .orderBy(asc(schema.runEvents.seq))
        .limit(200);

      for (const r of rows) {
        last = Math.max(last, r.seq);
        res.write(
          sseEncode({
            id: r.seq,
            type: r.type,
            data: { seq: r.seq, payload: r.payload, createdAt: r.createdAt },
          })
        );
      }
    } catch (e: any) {
      res.write(sseEncode({ type: "ERROR", data: { message: "SSE poll failed" } }));
    } finally {
      polling = false;
    }
  }, 800);

  const cleanup = () => {
    clearInterval(poll);
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {}
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}