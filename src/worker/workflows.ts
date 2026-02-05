// worker/workflows.ts
import * as wf from "@temporalio/workflow";
import type * as acts from "./activities";

export type ProseRunArgs = { runId: string };

const { setRunStatus, writeEvent, fakeSession } = wf.proxyActivities<typeof acts>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3 },
});

export async function ProseRunWorkflow({ runId }: ProseRunArgs) {
  await setRunStatus({ runId, status: "running" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "running" } });

  // Phase 1: pretend the VM parsed a statement and is executing it
  await writeEvent({ runId, type: "STEP_STARTED", payload: { step: "fake_session" } });

  await fakeSession({ runId });

  await writeEvent({ runId, type: "STEP_COMPLETED", payload: { step: "fake_session" } });

  await setRunStatus({ runId, status: "succeeded" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "succeeded" } });

  return { ok: true };
}