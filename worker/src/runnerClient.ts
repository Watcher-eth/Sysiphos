export type RunnerSpawnResponse = {
  ok: boolean;
  sessionId: string;
  status: "succeeded" | "failed";
  outputs: {
    bindingName: string;
    kind: "output" | "input" | "let" | "const";
    contentRef: string;
    mime?: string;
    size?: number;
    sha256?: string;
    preview?: string;
    summary?: string;
  };
};

export async function spawnSessionAndWait(runId: string): Promise<RunnerSpawnResponse> {
  const baseUrl = process.env.RUNNER_URL!;
  const token = process.env.RUNNER_SHARED_SECRET!;
  if (!baseUrl) throw new Error("RUNNER_URL missing");
  if (!token) throw new Error("RUNNER_SHARED_SECRET missing");

  const res = await fetch(`${baseUrl}/spawn-session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runner-token": token,
    },
    body: JSON.stringify({ runId, agentType: "mock" }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Runner ${res.status}: ${text}`);
  return JSON.parse(text) as RunnerSpawnResponse;
}