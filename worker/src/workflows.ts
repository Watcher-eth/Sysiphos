import * as wf from "@temporalio/workflow";
import { CancelledFailure } from "@temporalio/workflow";
import type * as acts from "./activities";

export type ProseRunArgs = { runId: string; programHash: string };

type RunFinalStatus = "succeeded" | "failed" | "canceled";

const {
  setRunStatus,
  writeEvent,
  createTodo,
  SpawnSessionAndWait,
  settleRunBilling,
} = wf.proxyActivities<typeof acts>({
  startToCloseTimeout: "60s",
  retry: { maximumAttempts: 3 },
});

export async function ProseRunWorkflow({ runId, programHash }: ProseRunArgs) {
  await setRunStatus({ runId, status: "running" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "running" } });

  await createTodo({ runId, order: 0, text: "Collect context + constraints" });
  await createTodo({ runId, order: 1, text: "Execute task plan" });
  await createTodo({ runId, order: 2, text: "Write deliverables + finalize" });

  let finalStatus: RunFinalStatus = "failed";
  let usage: any = null;

  try {
    await writeEvent({
      runId,
      type: "STEP_STARTED",
      payload: { step: "runner_session", programHash },
    });

    const resp = await SpawnSessionAndWait({ runId, programHash });
    usage = resp?.usage ?? null;

    await writeEvent({
      runId,
      type: "STEP_COMPLETED",
      payload: { step: "runner_session", programHash },
    });

    finalStatus = resp?.status === "succeeded" ? "succeeded" : "failed";
    await setRunStatus({ runId, status: finalStatus });
    await writeEvent({
      runId,
      type: "RUN_STATUS",
      payload: { status: finalStatus },
    });

    return { ok: true, status: finalStatus };
  } catch (e: any) {
    if (e instanceof CancelledFailure) {
      finalStatus = "canceled";
      await setRunStatus({ runId, status: "canceled" });
      await writeEvent({
        runId,
        type: "RUN_STATUS",
        payload: { status: "canceled" },
      });
      throw e;
    }

    finalStatus = "failed";
    await writeEvent({
      runId,
      type: "ERROR",
      payload: { message: String(e?.message ?? e) },
    });
    await setRunStatus({ runId, status: "failed" });
    await writeEvent({
      runId,
      type: "RUN_STATUS",
      payload: { status: "failed" },
    });
    throw e;
  } finally {
    await settleRunBilling({ runId, status: finalStatus, usage });
  }
}