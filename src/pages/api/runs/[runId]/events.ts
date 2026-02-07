// src/pages/api/runs/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runEventsHub } from "@/lib/runs/eventHub";

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableJson(value[k])).join(",")}}`;
}

function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function mustRunnerSecret() {
  const s =
    process.env.RUNNER_SHARED_SECRET ??
    process.env.SHARED_SECRET ??
    process.env.RUNNER_TOKEN;
  if (!s) throw new Error("RUNNER_SHARED_SECRET missing");
  return s;
}

type ProducerEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName?: string;
  sessionId?: string;

  // ✅ producer-local sequence (formerly seq)
  sourceSeq: number;

  ts: string;
  event: any;
  usage?: any;
};

type IngestBody = {
  ok: true;
  v: 1;
  runId: string;
  programHash?: string;
  principalId?: string;
  source?: string; // "runner" | "worker" | "control_plane"
  events: ProducerEnvelope[];
};

function mapAgentEventToRowFields(e: ProducerEnvelope) {
  const ev = e.event ?? {};
  const agentEventType = String(ev.type ?? "log");

  let type: schema.RunEventType = "LOG";
  let action: string | null = null;

  let todoId: string | null = null;
  let stepId: string | null = null;
  let artifactId: string | null = null;
  let filePath: string | null = null;
  let checkpointId: string | null = null;
  let level: string | null = null;

  if (agentEventType === "session_started" || agentEventType === "session_resumed") {
    type = "RUN_STATUS";
    action = agentEventType === "session_started" ? "started" : "resumed";
  } else if (agentEventType === "todo") {
    type = "TODO";
    action = String(ev.op ?? "add");
    todoId = ev.id ? String(ev.id) : null;
  } else if (agentEventType === "step") {
    type = "STEP";
    // your protocol: status started|completed|failed
    action = String(ev.status ?? "started");
    // prefer tool_use_id if present
    stepId = ev.id ? String(ev.id) : (ev.toolUseId ? String(ev.toolUseId) : null);
  } else if (agentEventType === "artifact") {
    type = "ARTIFACT";
    action = String(ev.op ?? "created");
    artifactId = ev.id ? String(ev.id) : (ev.contentRef ? String(ev.contentRef) : null);
    filePath = ev.path ? String(ev.path) : null;
  } else if (agentEventType === "file") {
    type = "FILE";
    action = String(ev.op ?? ev.action ?? "edited");
    filePath = ev.path ? String(ev.path) : null;
    checkpointId = ev.checkpointId ?? ev.data?.checkpointId;
  } else if (agentEventType === "checkpoint") {
    type = "CHECKPOINT";
    action = String(ev.op ?? "created");
    checkpointId = ev.id ? String(ev.id) : (ev.providerCheckpointId ? String(ev.providerCheckpointId) : null);
  } else if (agentEventType === "result_text" || agentEventType === "result") {
    type = "RESULT";
    action = "final";
  } else if (agentEventType === "error") {
    type = "ERROR";
    action = "raised";
    level = "error";
  } else {
    type = "LOG";
    level = String(ev.level ?? "info");
  }

  return { type, action, todoId, stepId, artifactId, filePath, checkpointId, level };
}

async function nextSeq(runId: string): Promise<number> {
  const row = await db
    .select({ m: max(schema.runEvents.seq) })
    .from(schema.runEvents)
    .where(eq(schema.runEvents.runId, runId as any));
  return Number(row[0]?.m ?? 0) + 1;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const secret = mustRunnerSecret();
  const token = String(req.headers["x-runner-token"] ?? "");
  const sig = String(req.headers["x-runner-sig"] ?? "");

  if (!token || !sig) return res.status(401).send("Missing runner auth headers");
  if (!safeEqual(token, secret)) return res.status(401).send("Invalid runner token");

  let body: IngestBody;
  try {
    body = req.body as IngestBody;
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  if (!body || body.ok !== true || body.v !== 1) return res.status(400).send("Bad body");
  if (!body.runId || !Array.isArray(body.events)) return res.status(400).send("Missing runId/events");

  const canon = stableJson(body);
  const expected = hmacHex(secret, canon);
  if (!safeEqual(sig, expected)) return res.status(401).send("Invalid signature");

  const runExists = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(eq(schema.runs.id, body.runId as any))
    .limit(1);

  if (!runExists[0]) return res.status(404).send("Run not found");

  const source = (body.source ?? "runner").slice(0, 64);

  // ✅ insert with server-assigned seq; producer idempotency on (runId, source, sourceSeq)
  const inserted = await db.transaction(async (tx) => {
    let seq = await nextSeq(body.runId);

    const rows = body.events.map((e) => {
      const fields = mapAgentEventToRowFields(e);
      const agentName = (e.agentName ?? body.principalId ?? "system").slice(0, 128);
      const sessionId = e.sessionId ? String(e.sessionId).slice(0, 256) : null;

      const row = {
        runId: body.runId as any,
        seq: seq++,
        source,
        sourceSeq: Number(e.sourceSeq ?? 0),

        type: fields.type,

        agentName,
        sessionId,

        action: fields.action,
        level: fields.level,

        todoId: fields.todoId,
        stepId: fields.stepId,
        artifactId: fields.artifactId,
        filePath: fields.filePath,
        checkpointId: fields.checkpointId,

        payload: {
          ...e,
          runId: body.runId,
          principalId: body.principalId ?? e.principalId,
          programHash: body.programHash ?? e.programHash,
        },
        createdAt: new Date(e.ts),
      };

      return row;
    });

    const out = await tx
      .insert(schema.runEvents)
      .values(rows as any)
      .onConflictDoNothing({
        target: [schema.runEvents.runId, schema.runEvents.source, schema.runEvents.sourceSeq],
      })
      .returning({
        runId: schema.runEvents.runId,
        seq: schema.runEvents.seq,
        type: schema.runEvents.type,
        payload: schema.runEvents.payload,
        createdAt: schema.runEvents.createdAt,
      });

    return out;
  });

  if (inserted.length) {
    runEventsHub.publishMany(
      body.runId,
      inserted.map((r) => ({
        runId: String(r.runId),
        seq: Number(r.seq),
        type: String(r.type),
        payload: r.payload,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))
    );
  }

  return res.status(200).json({ ok: true, inserted: inserted.length });
}