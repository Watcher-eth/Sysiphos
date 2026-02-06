// scripts/test-run.ts
import {EventSource} from "eventsource";

type EventRow = { type: string; seq: number };

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// You need an authenticated cookie.
// Easiest: open devtools → Application → Cookies → copy `next-auth.session-token` (or `__Secure-next-auth.session-token`)
const COOKIE = process.env.COOKIE ?? "next-auth.session-token=adf6029b-05d1-42e9-b2a3-cf9531a53282";

if (!COOKIE) {
  console.error("Missing COOKIE env var. Export your next-auth session cookie.");
  process.exit(1);
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Cookie: COOKIE,
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return json ?? text;
}

async function createRun(): Promise<string> {
  const out = await http("/api/runs/create", { method: "POST" });
  console.log(out);
  return out.runId as string;
}

async function startRun(runId: string) {
  return http(`/api/runs/${runId}/start`, { method: "POST" });
}

async function waitForEvents(runId: string, timeoutMs = 30_000) {
  const events: EventRow[] = [];
  const counts: Record<string, number> = {};

  const want = [
    "RUN_CREATED",
    "RUN_STATUS",
    "TODO_CREATED",
    "BINDING_WRITTEN",
    "RUN_STATUS",
  ];

  const start = Date.now();

  await new Promise<void>((resolve, reject) => {
    const es = new EventSource(`${BASE}/api/runs/${runId}/events?after=0`, {
      headers: { Cookie: COOKIE },
    } as any);

    const done = () => {
      es.close();
      resolve();
    };

    const fail = (err: any) => {
      es.close();
      reject(err);
    };

    const bump = (type: string, seq: number) => {
      events.push({ type, seq });
      counts[type] = (counts[type] ?? 0) + 1;

      // stop condition: we saw succeeded status
      if (type === "RUN_STATUS") {
        // payload is in "message event data", but we don't need it for minimal check here
        // We’ll just wait until we’ve seen 2 RUN_STATUS events total in Phase 1
        if ((counts["RUN_STATUS"] ?? 0) >= 2 && (counts["BINDING_WRITTEN"] ?? 0) >= 1) {
          done();
        }
      }

      if (Date.now() - start > timeoutMs) {
        fail(new Error("Timeout waiting for expected events"));
      }
    };

    const handler = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        bump(type, data?.seq ?? -1);
        // console.log(type, data);
      } catch {
        bump(type, -1);
      }
    };

    ["RUN_CREATED", "RUN_STATUS", "TODO_CREATED", "BINDING_WRITTEN", "ERROR"].forEach((t) => {
      es.addEventListener(t, handler(t) as any);
    });

    es.onerror = () => {
      // eventsource can call onerror transiently; treat hard timeout as failure instead
    };
  });

  return { events, counts };
}

function assertPhase1(counts: Record<string, number>) {
  if ((counts["RUN_CREATED"] ?? 0) !== 1) throw new Error(`Expected RUN_CREATED once, got ${counts["RUN_CREATED"] ?? 0}`);
  if ((counts["TODO_CREATED"] ?? 0) !== 3) throw new Error(`Expected TODO_CREATED 3x, got ${counts["TODO_CREATED"] ?? 0}`);
  if ((counts["BINDING_WRITTEN"] ?? 0) !== 1) throw new Error(`Expected BINDING_WRITTEN once, got ${counts["BINDING_WRITTEN"] ?? 0}`);
  if ((counts["RUN_STATUS"] ?? 0) < 2) throw new Error(`Expected RUN_STATUS >=2, got ${counts["RUN_STATUS"] ?? 0}`);
}

async function main() {
  console.log("Creating run…");
  const runId = await createRun();
  console.log("runId =", runId);

  console.log("Starting run (first)…");
  console.log(await startRun(runId));

  console.log("Starting run (second, should be idempotent)…");
  console.log(await startRun(runId));

  console.log("Listening for SSE events…");
  const { counts } = await waitForEvents(runId);

  console.log("Counts:", counts);
  assertPhase1(counts);

  console.log("✅ Phase 1 E2E OK");
}

main().catch((e) => {
  console.error("❌ E2E failed:", e);
  process.exit(1);
});