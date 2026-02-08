// src/pages/api/runs/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHash, createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
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

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

const VALID_ARTIFACT_TYPES = new Set(["document", "spreadsheet", "email", "file", "patch", "log"]);
const VALID_FILE_OPS = new Set([
  "opened",
  "read",
  "created",
  "edited",
  "deleted",
  "moved",
  "copied",
  "mkdir",
  "rmdir",
]);

type DeliverableSpec = {
  id?: string;
  type?: string;
  label?: string;
  title?: string;
  name?: string;
};

function normalizeDeliverablesSpec(input: any): DeliverableSpec[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((d) => (d && typeof d === "object" ? (d as DeliverableSpec) : null))
    .filter(Boolean)
    .map((d) => ({
      id: d?.id ? String(d.id) : undefined,
      type: d?.type ? String(d.type) : undefined,
      label: d?.label ? String(d.label) : d?.title ? String(d.title) : d?.name ? String(d.name) : undefined,
    }));
}

function mapDeliverableTypeToArtifactType(t?: string) {
  const type = (t ?? "").toLowerCase();
  if (type === "doc" || type === "document") return "document";
  if (type === "sheet" || type === "spreadsheet" || type === "csv" || type === "excel") return "spreadsheet";
  if (type === "email") return "email";
  if (type === "edit" || type === "patch") return "patch";
  if (type === "file") return "file";
  return type || null;
}

function matchDeliverable(args: {
  deliverables: DeliverableSpec[];
  artifactType: string;
  artifactTitle: string;
  deliverableId?: string | null;
}): DeliverableSpec | null {
  const { deliverables, artifactType, artifactTitle, deliverableId } = args;
  if (!deliverables.length) return null;
  if (deliverableId) {
    const byId = deliverables.find((d) => d.id === deliverableId);
    if (byId) return byId;
  }
  const title = artifactTitle.trim().toLowerCase();
  const byLabel = deliverables.find((d) => (d.label ?? "").trim().toLowerCase() === title);
  if (byLabel) return byLabel;
  const byType = deliverables.find((d) => mapDeliverableTypeToArtifactType(d.type) === artifactType);
  return byType ?? null;
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
    .select({ id: schema.runs.id, taskId: schema.runs.taskId })
    .from(schema.runs)
    .where(eq(schema.runs.id, body.runId as any))
    .limit(1);

  if (!runExists[0]) return res.status(404).send("Run not found");
  const taskId = runExists[0].taskId ? String(runExists[0].taskId) : null;

  let deliverablesSpec: DeliverableSpec[] = [];
  if (taskId) {
    const taskRow = await db
      .select({ deliverablesSpec: schema.tasks.deliverablesSpec })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId as any))
      .limit(1);
    deliverablesSpec = normalizeDeliverablesSpec(taskRow[0]?.deliverablesSpec ?? []);
  }

  const source = (body.source ?? "runner").slice(0, 64);

  const inserted = await db.transaction(async (tx) => {
    const { start } = await allocateSeqRange(tx as any, body.runId, body.events.length);

    let seq = start;

    const todoRows: Array<{
      runId: any;
      externalId: string;
      text: string;
      description: string;
      status: string;
      order: number;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    const todoDeletes: Array<{ runId: any; externalId: string }> = [];

    const artifactRows: Array<{
      runId: any;
      type: any;
      title: string;
      deliverableKey: string | null;
      contentRef: string | null;
      sha256: string | null;
      mime: string | null;
      size: number | null;
      createdBy: string;
      createdAt: Date;
    }> = [];

    const fileOpRows: Array<{
      runId: any;
      op: any;
      path: string;
      beforeContentRef: string | null;
      afterContentRef: string | null;
      checkpointId: string | null;
      toolName: string | null;
      toolUseId: string | null;
      createdAt: Date;
      payload: any;
    }> = [];

    const checkpointRows: Array<{
      runId: any;
      provider: string;
      providerCheckpointId: string;
      status: "created" | "restored" | "dropped";
      createdAt: Date;
      payload: any;
    }> = [];

    const rows: Array<any> = [];
    for (const e of body.events) {
      const event = e?.event ?? { type: "log", level: "warn", message: "missing_event" };
      const classified = classifyEvent(event);

      const payload = {
        ...e,
        runId: body.runId,
        principalId: body.principalId ?? e.principalId,
        programHash: body.programHash ?? e.programHash,
        event,
      };

      rows.push({
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
      });

      if (event?.type === "artifact" && deliverablesSpec.length) {
        const data = (event as any).data && typeof (event as any).data === "object" ? (event as any).data : {};
        const rawType = String((event as any).artifactType ?? data.type ?? data.artifactType ?? "");
        const type = VALID_ARTIFACT_TYPES.has(rawType) ? rawType : "file";
        const title = String((event as any).title ?? data.title ?? "Artifact");
        const deliverableId = String((event as any).deliverableId ?? data.deliverableId ?? "").trim() || null;
        const matched = matchDeliverable({
          deliverables: deliverablesSpec,
          artifactType: type,
          artifactTitle: title,
          deliverableId,
        });

        if (!matched) {
          rows.push({
            runId: body.runId as any,
            seq: seq++,
            source,
            sourceSeq: Number(e.sourceSeq ?? 0),
            type: "LOG",
            agentName: normStr(e.agentName) ?? normStr(body.principalId) ?? "system",
            sessionId: normStr(e.sessionId) ?? null,
            action: "artifact_validation_failed",
            level: "warn",
            todoId: null,
            stepId: null,
            artifactId: null,
            filePath: null,
            checkpointId: null,
            payload: {
              event: {
                type: "log",
                level: "warn",
                message: "artifact_validation_failed",
                data: {
                  artifactType: type,
                  artifactTitle: title,
                  deliverableId,
                  deliverablesSpec,
                },
              },
            },
            createdAt: new Date(e.ts),
          });
        }
      }
    }

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

    for (const e of body.events) {
      const event = e?.event ?? null;
      if (!event || typeof event !== "object") continue;
      const ts = new Date(e.ts ?? Date.now());

      if (event.type === "todo") {
        const op = String((event as any).op ?? "add");
        const text = String((event as any).text ?? "").trim();
        const externalId =
          String((event as any).id ?? "").trim() ||
          (text ? `text:${sha256Hex(text)}` : `event:${sha256Hex(JSON.stringify(event))}`);
        const status =
          String((event as any).status ?? "").trim() ||
          (op === "complete" ? "completed" : op === "add" ? "pending" : "in_progress");
        const order = (event as any).order != null ? Number((event as any).order) : 0;
        const description = String((event as any).description ?? "");
        if (op === "remove") {
          todoDeletes.push({ runId: body.runId as any, externalId });
        } else {
          todoRows.push({
            runId: body.runId as any,
            externalId,
            text: text || "Todo",
            description,
            status,
            order: Number.isFinite(order) ? order : 0,
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }

      if (event.type === "artifact") {
        const data =
          (event as any).data && typeof (event as any).data === "object" ? (event as any).data : {};
        const rawType = String((event as any).artifactType ?? data.type ?? data.artifactType ?? "");
        const type = VALID_ARTIFACT_TYPES.has(rawType) ? rawType : "file";
        const title = String((event as any).title ?? data.title ?? "Artifact");
        const deliverableId = String((event as any).deliverableId ?? data.deliverableId ?? "").trim() || null;
        const matched = matchDeliverable({
          deliverables: deliverablesSpec,
          artifactType: type,
          artifactTitle: title,
          deliverableId,
        });
        const deliverableKey = matched?.id
          ? `id:${matched.id}`
          : matched?.label
          ? `label:${matched.label.trim().toLowerCase()}`
          : null;
        const contentRef =
          String((event as any).contentRef ?? data.contentRef ?? data.ref ?? "").trim() || null;
        const sha256 = String((event as any).sha256 ?? data.sha256 ?? "").trim() || null;
        const mime = String((event as any).mime ?? data.mime ?? "").trim() || null;
        const sizeVal = (event as any).size ?? data.size;
        const size = sizeVal != null && Number.isFinite(Number(sizeVal)) ? Number(sizeVal) : null;

        artifactRows.push({
          runId: body.runId as any,
          type: type as any,
          title,
          deliverableKey,
          contentRef,
          sha256,
          mime,
          size,
          createdBy: "agent",
          createdAt: ts,
        });
      }

      if (event.type === "file") {
        const opRaw = String((event as any).op ?? (event as any).action ?? "edited");
        const op = VALID_FILE_OPS.has(opRaw) ? opRaw : "edited";
        const path = String((event as any).path ?? (event as any).filePath ?? "");
        if (path) {
          const beforeContentRef =
            String(
              (event as any).beforeContentRef ??
                (event as any).contentRefBefore ??
                (event as any).data?.beforeContentRef ??
                (event as any).data?.contentRefBefore ??
                ""
            ) || null;
          const afterContentRef =
            String(
              (event as any).afterContentRef ??
                (event as any).contentRefAfter ??
                (event as any).data?.afterContentRef ??
                (event as any).data?.contentRefAfter ??
                ""
            ) || null;
          fileOpRows.push({
            runId: body.runId as any,
            op: op as any,
            path,
            beforeContentRef,
            afterContentRef,
            checkpointId: String((event as any).checkpointId ?? (event as any).data?.checkpointId ?? "") || null,
            toolName: String((event as any).toolName ?? "") || null,
            toolUseId: String((event as any).toolUseId ?? "") || null,
            createdAt: ts,
            payload: event,
          });
        }
      }

      if (event.type === "checkpoint") {
        const checkpointId = String((event as any).checkpointId ?? (event as any).id ?? "").trim();
        if (checkpointId) {
          const opRaw = String((event as any).op ?? "create");
          const status = opRaw === "restore" ? "restored" : opRaw === "drop" ? "dropped" : "created";
          checkpointRows.push({
            runId: body.runId as any,
            provider: "claude_sdk",
            providerCheckpointId: checkpointId,
            status,
            createdAt: ts,
            payload: event,
          });
        }
      }
    }

    if (todoRows.length) {
      await tx
        .insert(schema.todos)
        .values(todoRows as any)
        .onConflictDoUpdate({
          target: [schema.todos.runId, schema.todos.externalId],
          set: {
            text: sql`excluded.${schema.todos.text}`,
            description: sql`excluded.${schema.todos.description}`,
            status: sql`excluded.${schema.todos.status}`,
            order: sql`excluded.${schema.todos.order}`,
            updatedAt: sql`excluded.${schema.todos.updatedAt}`,
          } as any,
        });
    }

    if (todoDeletes.length) {
      for (const td of todoDeletes) {
        await tx
          .delete(schema.todos)
          .where(and(eq(schema.todos.runId, td.runId), eq(schema.todos.externalId, td.externalId)));
      }
    }

    if (artifactRows.length) {
      const withContentRef = artifactRows.filter((a) => a.contentRef);
      const noContentRef = artifactRows.filter((a) => !a.contentRef);

      if (withContentRef.length) {
        await tx
          .insert(schema.artifacts)
          .values(withContentRef as any)
          .onConflictDoUpdate({
            target: [schema.artifacts.runId, schema.artifacts.contentRef],
            set: {
              type: sql`excluded.${schema.artifacts.type}`,
              title: sql`excluded.${schema.artifacts.title}`,
              deliverableKey: sql`excluded.${schema.artifacts.deliverableKey}`,
              sha256: sql`excluded.${schema.artifacts.sha256}`,
              mime: sql`excluded.${schema.artifacts.mime}`,
              size: sql`excluded.${schema.artifacts.size}`,
            } as any,
          });
      }

      if (noContentRef.length) {
        await tx.insert(schema.artifacts).values(noContentRef as any);
      }
    }

    if (fileOpRows.length) {
      await tx.insert(schema.runFileOps).values(fileOpRows as any);
    }

    if (checkpointRows.length) {
      await tx
        .insert(schema.runCheckpoints)
        .values(checkpointRows as any)
        .onConflictDoUpdate({
          target: [schema.runCheckpoints.runId, schema.runCheckpoints.providerCheckpointId],
          set: {
            status: sql`excluded.${schema.runCheckpoints.status}`,
            payload: sql`excluded.${schema.runCheckpoints.payload}`,
          } as any,
        });
    }

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