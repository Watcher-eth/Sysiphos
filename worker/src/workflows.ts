import * as wf from "@temporalio/workflow";
import type * as acts from "./activities";

export type ProseRunArgs = { runId: string };

const { setRunStatus, writeEvent, createTodo, SpawnSessionAndWait } =
  wf.proxyActivities<typeof acts>({
    startToCloseTimeout: "60s",
    retry: { maximumAttempts: 3 },
  });

export async function ProseRunWorkflow({ runId }: ProseRunArgs) {
  await setRunStatus({ runId, status: "running" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "running" } });

  await createTodo({ runId, order: 0, text: "Collect context + constraints" });
  await createTodo({ runId, order: 1, text: "Execute task plan" });
  await createTodo({ runId, order: 2, text: "Write deliverables + finalize" });

  await writeEvent({ runId, type: "STEP_STARTED", payload: { step: "runner_session" } });
  await SpawnSessionAndWait({ runId });
  await writeEvent({ runId, type: "STEP_COMPLETED", payload: { step: "runner_session" } });

  await setRunStatus({ runId, status: "succeeded" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "succeeded" } });

  return { ok: true };
}