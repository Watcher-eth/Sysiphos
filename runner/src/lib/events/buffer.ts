import { createHmac } from "node:crypto";
import { env } from "../../env";
import type { AgentEventEnvelope } from "./types";

function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function mustControlPlaneBaseUrl() {
  const base = env.controlPlaneBaseUrl;
  if (!base) throw new Error("events_missing_control_plane_base_url");
  return base;
}

function eventsUrl() {
  // control plane should implement: POST /api/runs/events
  return new URL("/api/runs/events", mustControlPlaneBaseUrl()).toString();
}

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableJson(value[k])).join(",")}}`;
}

function signBody(secret: string, bodyJson: any) {
  // signature over canonical json for idempotency + replay protection
  const canon = stableJson(bodyJson);
  return {
    canon,
    sig: hmacHex(secret, canon),
  };
}

export type PostEventsArgs = {
  runId: string;
  programHash: string;
  principalId: string;
  events: AgentEventEnvelope[];
};

export async function postEvents(args: PostEventsArgs): Promise<void> {
  if (!env.controlPlaneBaseUrl) return; // allow local runner usage without control plane
  if (!args.events.length) return;

  const body = {
    ok: true,
    v: 1,
    runId: args.runId,
    programHash: args.programHash,
    principalId: args.principalId,
    source: "runner",
    events: args.events,
  };

  const { sig } = signBody(env.sharedSecret, body);

  const res = await fetch(eventsUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runner-token": env.sharedSecret, // same auth style you already use
      "x-runner-sig": sig,               // body integrity
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`events_post_failed ${res.status}: ${text}`);
  }
}

  export type EventBufferOptions = {
    flushEveryMs?: number; // default 500ms
    maxBatch?: number;     // default 50
    maxQueue?: number;     // default 2000 (drop oldest if exceeded)
  };
  
  export class EventBuffer {
    private seq = 0;
    private q: AgentEventEnvelope[] = [];
    private timer: any | null = null;
    private flushing = false;
  
    private readonly opts: Required<EventBufferOptions>;
  
    constructor(
      private readonly base: Omit<AgentEventEnvelope, "seq" | "ts" | "event" | "usage">,
      opts?: EventBufferOptions // ✅ accept partial
    ) {
      this.opts = {
        flushEveryMs: 500,
        maxBatch: 50,
        maxQueue: 2000,
        ...(opts ?? {}),
      };
    }
  
    start() {
      if (this.timer) return;
      this.timer = setInterval(() => {
        void this.flush().catch(() => {});
      }, this.opts.flushEveryMs);
    }
  
    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
  
    enqueue(
      event: AgentEventEnvelope["event"],
      usage?: AgentEventEnvelope["usage"],
      override?: Partial<Pick<AgentEventEnvelope, "agentName" | "sessionId">>
    ) {
      const envlp: AgentEventEnvelope = {
        ...this.base,
        ...(override ?? {}),
        seq: ++this.seq,
        ts: new Date().toISOString(),
        event,
        usage,
      };
  
      this.q.push(envlp);
      if (this.q.length > this.opts.maxQueue) this.q.splice(0, this.q.length - this.opts.maxQueue);
    }
  
    async flush() {
    if (!env.controlPlaneBaseUrl) return;
    if (this.flushing) return;
    if (!this.q.length) return;

    this.flushing = true;
    try {
      const batch = this.q.splice(0, this.opts.maxBatch);
      await postEvents({
        runId: this.base.runId,
        programHash: this.base.programHash,
        principalId: this.base.principalId,
        events: batch,
      });

      // if more remains, flush again quickly
      if (this.q.length) {
        await postEvents({
          runId: this.base.runId,
          programHash: this.base.programHash,
          principalId: this.base.principalId,
          events: this.q.splice(0, this.opts.maxBatch),
        }).catch(() => {});
      }
    } finally {
      this.flushing = false;
    }
  }

  async flushAllAndStop() {
    this.stop();
    await this.flush();
  }
}