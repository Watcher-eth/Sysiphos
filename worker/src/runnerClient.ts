// worker/src/runnerClient.ts
export type RunnerUsage = {
  wallClockMs: number;
  tokensIn?: number;
  tokensOut?: number;
  costCredits?: number;
};

export type RunnerSpawnResponse = {
  ok: boolean;
  sessionId: string;
  status: "succeeded" | "failed";
  outputs: Array<{
    bindingName: string;
    kind: "output" | "input" | "let" | "const";
    contentRef: string;
    mime?: string;
    size?: number;
    sha256?: string;
    preview?: string;
    summary?: string;
  }>;
  usage?: RunnerUsage;
};

function buildIdempotencyKey(args: {
  runId: string;
  programHash: string;
  agentType?: string;
  principalId?: string;
}) {
  const agent = args.agentType ?? "mock";
  const principal = args.principalId?.trim() || "system";
  return `spawn:${args.runId}:${args.programHash}:${agent}:${principal}`;
}

export async function spawnRunnerSession(args: {
  runId: string;
  programHash: string;
  agentType?: string;

  // ✅ per-user (or per participant) isolation
  principalId?: string;

  // allow override in special cases (e.g. step-level idempotency)
  idempotencyKey?: string;
}) {
  const { runId, programHash, agentType = "mock" } = args;

  const baseUrl = process.env.RUNNER_URL;
  const token = process.env.RUNNER_SHARED_SECRET;

  if (!baseUrl) throw new Error("RUNNER_URL missing");
  if (!token) throw new Error("RUNNER_SHARED_SECRET missing");

  const principalId = args.principalId?.trim() || "system";

  const idempotencyKey =
    args.idempotencyKey ??
    buildIdempotencyKey({ runId, programHash, agentType, principalId });

  const res = await fetch(`${baseUrl}/spawn-session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runner-token": token,
      // ✅ critical for Temporal retries
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      runId,
      programHash,
      agentType,
      principalId, // ✅ send through
      idempotencyKey,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Runner ${res.status}: ${text}`);

  let parsed: RunnerSpawnResponse;
  try {
    parsed = JSON.parse(text) as RunnerSpawnResponse;
  } catch {
    throw new Error(`Runner invalid JSON: ${text.slice(0, 400)}`);
  }

  if (!parsed?.ok) {
    throw new Error(
      `Runner error: ${typeof parsed === "object" ? "not_ok" : "invalid_response"}`
    );
  }

  if (!Array.isArray((parsed as any).outputs)) {
    (parsed as any).outputs = [];
  }

  return parsed;
}