// src/pages/api/runs/[runId]/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runEventsHub } from "@/lib/runs/eventHub";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function sseEncode(event: { type: string; data: any; id?: string | number }) {
  let out = "";
  if (event.id !== undefined) out += `id: ${event.id}\n`;
  out += `event: ${event.type}\n`;
  out += `data: ${JSON.stringify(event.data)}\n\n`;
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
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  (res as any).flushHeaders?.();

  res.write(`retry: 1000\n\n`);
  res.write(`: connected\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15_000);

  // --- DB replay (authoritative) ---
  try {
    const rows = await db
      .select()
      .from(schema.runEvents)
      .where(and(eq(schema.runEvents.runId, runId as any), gt(schema.runEvents.seq, last)))
      .orderBy(asc(schema.runEvents.seq))
      .limit(1000);

    const events = rows.map((r) => ({
      runId,
      seq: r.seq,
      type: r.type,
      payload: r.payload,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    if (events.length) {
      last = Math.max(last, events[events.length - 1].seq);
    }

    res.write(
      sseEncode({
        type: "replay",
        id: last,
        data: {
          fromSeq: after,
          toSeq: last,
          events,
        },
      })
    );
  } catch (e) {
    res.write(sseEncode({ type: "ERROR", data: { message: "SSE replay failed" } }));
  }

  // --- Live stream from hub ---
  const unsubscribe = runEventsHub.subscribe(runId, (evt: any) => {
    if (evt.seq <= last) return;
    last = evt.seq;

    res.write(
      sseEncode({
        type: "event",
        id: evt.seq,
        data: evt, // {runId,seq,type,payload,createdAt}
      })
    );
  });

  const cleanup = () => {
    clearInterval(heartbeat);
    try {
      unsubscribe();
    } catch {}
    try {
      res.end();
    } catch {}
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
}