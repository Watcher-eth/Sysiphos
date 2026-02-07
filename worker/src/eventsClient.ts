import { createHmac } from "node:crypto";

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableJson(value[k])).join(",")}}`;
}

function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function mustControlPlaneBaseUrl() {
  const base = process.env.CONTROL_PLANE_BASE_URL ?? process.env.NEXTAUTH_URL;
  if (!base) throw new Error("missing_control_plane_base_url");
  return base;
}

function eventsUrl() {
  return new URL("/api/runs/events", mustControlPlaneBaseUrl()).toString();
}

export type WorkerEventEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName?: string;
  sessionId?: string;
  sourceSeq: number;
  ts: string;
  event: any;
  usage?: any;
};

export async function postWorkerEvents(args: {
  runId: string;
  programHash: string;
  principalId: string;
  events: WorkerEventEnvelope[];
}) {
  if (!args.events.length) return;

  const secret =
    process.env.RUNNER_SHARED_SECRET ??
    process.env.SHARED_SECRET ??
    process.env.RUNNER_TOKEN;

  if (!secret) throw new Error("missing_shared_secret");

  const body = {
    ok: true,
    v: 1,
    runId: args.runId,
    programHash: args.programHash,
    principalId: args.principalId,
    source: "worker",
    events: args.events,
  };

  const canon = stableJson(body);
  const sig = hmacHex(secret, canon);

  const res = await fetch(eventsUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runner-token": secret,
      "x-runner-sig": sig,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`worker_events_post_failed ${res.status}: ${text}`);
  }
}