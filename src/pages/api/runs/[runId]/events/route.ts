// src/app/api/runs/[runId]/events/route.ts
import { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

function sseEncode(event: { type: string; data: any; id?: string | number }) {
  const lines: string[] = [];
  if (event.id !== undefined) lines.push(`id: ${event.id}`);
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event.data)}`);
  lines.push("");
  return lines.join("\n");
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;

  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") ?? "0"); // last seen seq
  const heartbeatMs = 15_000;
  const pollMs = 800;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      controller.enqueue(enc.encode(`: connected\n\n`));

      let last = after;
      let closed = false;

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
      }, heartbeatMs);

      const poll = setInterval(async () => {
        if (closed) return;

        try {
          const rows = await db
            .select()
            .from(schema.runEvents)
            .where(and(eq(schema.runEvents.runId, runId as any), gt(schema.runEvents.seq, last)))
            .orderBy(asc(schema.runEvents.seq))
            .limit(200);

          for (const r of rows) {
            last = Math.max(last, r.seq);
            controller.enqueue(
              enc.encode(
                sseEncode({
                  id: r.seq,
                  type: r.type,
                  data: { seq: r.seq, payload: r.payload, createdAt: r.createdAt },
                })
              )
            );
          }
        } catch (e) {
          controller.enqueue(enc.encode(sseEncode({ type: "ERROR", data: { message: "SSE poll failed" } })));
        }
      }, pollMs);

      const abort = () => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        controller.close();
      };

      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}