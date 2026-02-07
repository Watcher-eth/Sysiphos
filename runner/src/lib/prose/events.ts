type RunEventEnvelope = {
    runId: string;
    principalId: string;
    agentName?: string;
    sessionId?: string;
    seq: number;
    ts: string;
    event: any;
  };
  
  function safeJson(v: any) {
    try {
      return JSON.stringify(v);
    } catch {
      return JSON.stringify({ type: "log", level: "warn", message: "event_unserializable" });
    }
  }
  
  export async function emitRunEvent(params: {
    controlPlaneBaseUrl?: string;
    runnerToken: string;
    envelope: RunEventEnvelope;
  }): Promise<void> {
    const { controlPlaneBaseUrl, runnerToken, envelope } = params;
    if (!controlPlaneBaseUrl) return;
  
    const url = new URL("/api/runs/events", controlPlaneBaseUrl);
  
    // Best-effort; never throw upstream
    try {
      await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-runner-token": runnerToken,
        },
        body: safeJson(envelope),
      });
    } catch {
      // swallow
    }
  }