// src/pages/api/runs/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
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

function normStr(x: any): string | null {
  const s = typeof x === "string" ? x.trim() : "";
  return s ? s : null;
}

function normLower(x: any): string | null {
  const s = typeof x === "string" ? x.trim().toLowerCase() : "";
  return s ? s : null;
}

type ProducerEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName?: string;
  sessionId?: string;

  // producer-local monotonic sequence (idempotency key)
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

type Classified = {
  type: schema.RunEventType;
  action?: string | null;
  level?: string | null;

  todoId?: string | null;
  stepId?: string | null;
  artifactId?: string | null;
  filePath?: string | null;
  checkpointId?: string | null;
};

function classifyEvent(event: any): Classified {
  const t = String(event?.type ?? "log");

  if (t === "step") {
    const status = normLower(event?.status) ?? "started";
    const stepId =
      normStr(event?.id) ??
      normStr(event?.toolUseId) ??
      normStr(event?.stepId) ??
      normStr(event?.key) ??
      normStr(event?.name) ??
      null;

    let action: string | null = status;
    if (status === "complete" || status === "done") action = "completed";
    if (status === "error") action = "failed";

    return { type: "STEP", action: action ?? "started", stepId };
  }

  if (t === "todo") {
    const op = normLower(event?.op) ?? "add";
    const todoId = normStr(event?.id) ?? null;
    return { type: "TODO", action: op, todoId };
  }

  if (t === "artifact") {
    const op = normLower(event?.op) ?? "created";
    const artifactId = normStr(event?.id) ?? normStr(event?.contentRef) ?? null;
    const filePath = normStr(event?.path) ?? null;
    return { type: "ARTIFACT", action: op, artifactId, filePath };
  }

  if (t === "file") {
    const op = normLower(event?.op) ?? normLower(event?.action) ?? "edited";
    const filePath = normStr(event?.path) ?? normStr(event?.filePath) ?? null;
    const checkpointId = normStr(event?.checkpointId ?? event?.data?.checkpointId) ?? null;
    return { type: "FILE", action: op, filePath, checkpointId };
  }

  if (t === "checkpoint") {
    const op = normLower(event?.op) ?? "created";
    const checkpointId =
      normStr(event?.id) ?? normStr(event?.providerCheckpointId) ?? null;
    return { type: "CHECKPOINT", action: op, checkpointId };
  }

  if (t === "result_text" || t === "result") return { type: "RESULT", action: "final" };

  if (t === "session_started" || t === "session_resumed") {
    return { type: "RUN_STATUS", action: t === "session_resumed" ? "resumed" : "started" };
  }

  if (t === "error") return { type: "ERROR", action: "raised", level: "error" };

  if (t === "log") {
    const level = normLower(event?.level) ?? "info";
    return { type: "LOG", level };
  }

  return { type: "LOG", level: "info" };
}

async function allocateSeqRange(tx: typeof db, runId: string, count: number) {
  // atomically: take current nextEventSeq, then increment by count
  const updated = await tx
    .update(schema.runs)
    .set({
      nextEventSeq: sql<number>`${schema.runs.nextEventSeq} + ${count}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.runs.id, runId as any))
    .returning({ start: schema.runs.nextEventSeq });

  const start = Number(updated[0]?.start ?? 1);
  return { start, endExclusive: start + count };
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

  const inserted = await db.transaction(async (tx) => {
    const { start } = await allocateSeqRange(tx as any, body.runId, body.events.length);

    let seq = start;

    const rows = body.events.map((e) => {
      const event = e?.event ?? { type: "log", level: "warn", message: "missing_event" };
      const classified = classifyEvent(event);

      const payload = {
        ...e,
        runId: body.runId,
        principalId: body.principalId ?? e.principalId,
        programHash: body.programHash ?? e.programHash,
        event,
      };

      return {
        runId: body.runId as any,
        seq: seq++,
        source,
        sourceSeq: Number(e.sourceSeq ?? 0),

        type: classified.type as any,

        agentName: normStr(e.agentName) ?? normStr(body.principalId) ?? "system",
        sessionId: normStr(e.sessionId) ?? null,

        action: classified.action ?? null,
        level: classified.level ?? null,

        todoId: classified.todoId ?? null,
        stepId: classified.stepId ?? null,
        artifactId: classified.artifactId ?? null,
        filePath: classified.filePath ?? null,
        checkpointId: classified.checkpointId ?? null,

        payload,
        createdAt: new Date(e.ts),
      };
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