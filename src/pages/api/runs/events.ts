// src/pages/api/runs/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runEventsHub } from "@/lib/runs/eventHub";

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => JSON.stringify(k) + ":" + stableJson(value[k]))
    .join(",")}}`;
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

type IngestBody = {
  ok: true;
  v: 1;
  runId: string;
  programHash?: string;
  principalId?: string;
  events: Array<{
    v: 1;
    runId: string;
    programHash: string;
    principalId: string;
    agentName?: string;
    sessionId?: string;
    seq: number;
    ts: string;
    event: any;
    usage?: any;
  }>;
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

function normStr(x: any): string | null {
  const s = typeof x === "string" ? x.trim() : "";
  return s ? s : null;
}

function normLower(x: any): string | null {
  const s = typeof x === "string" ? x.trim().toLowerCase() : "";
  return s ? s : null;
}

function classifyEvent(event: any): Classified {
  const t = String(event?.type ?? "log");

  // --- STEP ---
  if (t === "step") {
    const status = normLower(event?.status) ?? "started";
    const stepId =
      normStr(event?.id) ??
      normStr(event?.stepId) ??
      normStr(event?.key) ??
      normStr(event?.name) ??
      null;

    let action: string | null = status;
    if (status === "complete") action = "completed";
    if (status === "done") action = "completed";
    if (status === "error") action = "failed";

    return {
      type: "STEP",
      action: action ?? "started",
      stepId,
    };
  }

  // --- TODO ---
  if (t === "todo") {
    const op = normLower(event?.op) ?? "add";
    const todoId = normStr(event?.id) ?? null;
    return {
      type: "TODO",
      action: op,
      todoId,
    };
  }

  // --- ARTIFACT ---
  if (t === "artifact") {
    const op = normLower(event?.op) ?? "created";
    const artifactId = normStr(event?.id) ?? null;
    const filePath = normStr(event?.path) ?? null;
    return {
      type: "ARTIFACT",
      action: op,
      artifactId,
      filePath: filePath ?? null,
    };
  }

  // --- FILE OPS (explicit) ---
  if (t === "file") {
    const op = normLower(event?.op) ?? "edited";
    const path = normStr(event?.path) ?? normStr(event?.filePath) ?? null;
    return {
      type: "FILE",
      action: op,
      filePath: path,
    };
  }

  // --- CHECKPOINT ---
  if (t === "checkpoint") {
    const op = normLower(event?.op) ?? "created";
    const checkpointId =
      normStr(event?.checkpointId) ??
      normStr(event?.id) ??
      normStr(event?.providerCheckpointId) ??
      null;
    return {
      type: "CHECKPOINT",
      action: op,
      checkpointId,
    };
  }

  // --- RESULT ---
  if (t === "result_text") {
    return { type: "RESULT", action: "final" };
  }

  // --- RUN STATUS ---
  if (t === "session_started" || t === "session_resumed") {
    return { type: "RUN_STATUS", action: t === "session_resumed" ? "resumed" : "started" };
  }

  // --- ERROR ---
  if (t === "error") {
    return { type: "ERROR", action: "raised", level: "error" };
  }

  // --- LOG (default) ---
  if (t === "log") {
    const level = normLower(event?.level) ?? "info";
    return { type: "LOG", level };
  }

  return { type: "LOG", level: "info" };
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

  // Optional: verify program hash matches pinned program (soft)
  const pinned = await db
    .select({ programHash: schema.runs.programHash })
    .from(schema.runs)
    .where(eq(schema.runs.id, body.runId as any))
    .limit(1);

  const pinnedHash = String(pinned[0]?.programHash ?? "");
  const bodyHash = String(body.programHash ?? "");
  if (pinnedHash && bodyHash && pinnedHash !== bodyHash) {
    // don’t reject (runner can be ahead), but record a warning log row
    // (you can tighten this later)
  }

  const rowsToInsert = body.events.map((e) => {
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
      seq: Number(e.seq),
      type: classified.type as any,

      agentName: normStr(e.agentName) ?? null,
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

  const inserted = await db
    .insert(schema.runEvents)
    .values(rowsToInsert as any)
    .onConflictDoNothing({
      target: [schema.runEvents.runId, schema.runEvents.seq],
    })
    .returning({
      runId: schema.runEvents.runId,
      seq: schema.runEvents.seq,
      type: schema.runEvents.type,
      action: schema.runEvents.action,
      level: schema.runEvents.level,
      agentName: schema.runEvents.agentName,
      sessionId: schema.runEvents.sessionId,
      todoId: schema.runEvents.todoId,
      stepId: schema.runEvents.stepId,
      artifactId: schema.runEvents.artifactId,
      filePath: schema.runEvents.filePath,
      checkpointId: schema.runEvents.checkpointId,
      payload: schema.runEvents.payload,
      createdAt: schema.runEvents.createdAt,
    });

  if (inserted.length) {
    runEventsHub.publishMany(
      body.runId,
      inserted.map((r) => ({
        runId: String(r.runId),
        seq: Number(r.seq),
        type: String(r.type),
        payload: r.payload,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))
    );
  }

  return res.status(200).json({ ok: true, inserted: inserted.length });
}