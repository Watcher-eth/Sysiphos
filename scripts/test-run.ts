const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";
const COOKIE = process.env.COOKIE ?? "next-auth.session-token=adf6029b-05d1-42e9-b2a3-cf9531a53282";
if (!COOKIE) throw new Error("COOKIE env var missing (set to next-auth.session-token=...)");

type Json = any;
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (COOKIE) h["Cookie"] = COOKIE; // IMPORTANT: capital C
  return h;
}
async function compileRun(runId: string) {
  return await http(`/api/runs/${encodeURIComponent(runId)}/compile`, {
    method: "POST",
  });
}

async function http(path: string, init?: RequestInit) {
  const url = `${WEB_URL}${path}`;
  const headers = authHeaders(init?.headers as Record<string, string> | undefined);

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();

  let json: Json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return json ?? text;
}
async function createRun() {
  const taskId = process.env.TASK_ID;
  if (!taskId) throw new Error("TASK_ID env var missing");

  return await http(`/api/runs/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "E2E demo run",
      description: "created from scripts/test-run.ts",
      workspaceId: process.env.WORKSPACE_ID,
      taskId: process.env.TASK_ID, // add this
    }),  });
}

async function startRun(runId: string) {
  return await http(`/api/runs/${runId}/start`, { method: "POST" });
}

function isRetryableNetErr(e: any) {
  const msg = String(e?.message ?? e);
  return (
    msg.includes("ConnectionRefused") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("fetch failed")
  );
}

async function listenEventsOnce(runId: string, after = 0) {
  const url = `${WEB_URL}/api/runs/${runId}/events?after=${after}`;

  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`events ${res.status} ${res.statusText}: ${body}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body for SSE");

  const dec = new TextDecoder();
  let buf = "";
  let lastId = after;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += dec.decode(value, { stream: true });
    buf = buf.replace(/\r\n/g, "\n");

    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;

      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      if (!frame || frame.startsWith(":")) continue;

      let id: number | null = null;
      let event: string | null = null;
      const dataLines: string[] = [];

      for (const line of frame.split("\n")) {
        if (line.startsWith("id:")) id = Number(line.slice(3).trim());
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }

      if (dataLines.length === 0) continue;

      const dataStr = dataLines.join("\n");
      let payload: any = dataStr;
      try {
        payload = JSON.parse(dataStr);
      } catch {}

      if (id != null) lastId = id;

      console.log(`[SSE] id=${id} event=${event}`, payload);

      if (event === "RUN_STATUS" && payload?.payload?.status) {
        const st = payload.payload.status;
        if (st === "succeeded" || st === "failed" || st === "canceled") return lastId;
      }
    }
  }

  return lastId;
}

async function listenEvents(runId: string, after = 0) {
  const deadlineMs = 60_000;
  const t0 = Date.now();
  let last = after;

  while (Date.now() - t0 < deadlineMs) {
    try {
      last = await listenEventsOnce(runId, last);
      return last;
    } catch (e: any) {
      if (!isRetryableNetErr(e)) throw e;
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
  }

  throw new Error("Timed out waiting for terminal RUN_STATUS over SSE");
}

async function main() {
  console.log("Creating run…");
  const created = await createRun();
  console.log(created);

  const runId = created.runId as string;
  console.log("runId =", runId);

  console.log("Compiling run…");
  console.log(await compileRun(runId));

  console.log("Starting run (first)…");
  console.log(await startRun(runId));

  console.log("Starting run (second, should be idempotent)…");
  console.log(await startRun(runId));

  console.log("Listening for SSE events…");
  await listenEvents(runId, 0);
}

main().catch((e) => {
  console.error("❌ E2E failed:", e);
  process.exit(1);
});