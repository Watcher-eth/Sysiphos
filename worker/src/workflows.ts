// worker/src/workflows.ts
import * as wf from "@temporalio/workflow";
import { CancelledFailure } from "@temporalio/workflow";
import type * as acts from "./activities";

export type ProseRunArgs = { runId: string; programHash: string };
type RunFinalStatus = "succeeded" | "failed" | "canceled";

// Short ops: DB writes + event logs + todos
const {
  setRunStatus,
  writeEvent,
  createTodo,
  settleRunBilling,
} = wf.proxyActivities<typeof acts>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3 },
});

// Long op: runner execution can take minutes
const { SpawnSessionAndWait } = wf.proxyActivities<typeof acts>({
  startToCloseTimeout: "10m",
  retry: { maximumAttempts: 3 },
});

function errPayload(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : "Error";
  const stack = e instanceof Error ? e.stack : undefined;
  return { name, message: msg, stack };
}

export async function ProseRunWorkflow({ runId, programHash }: ProseRunArgs) {
  await setRunStatus({ runId, status: "running" });
  await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "running" } });

  // v1 placeholder todos (fine)
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

    if (resp?.status === "succeeded") {
      finalStatus = "succeeded";
      await writeEvent({
        runId,
        type: "STEP_COMPLETED",
        payload: { step: "runner_session", programHash },
      });
    } else {
      finalStatus = "failed";
      await writeEvent({
        runId,
        type: "STEP_FAILED",
        payload: { step: "runner_session", programHash, status: resp?.status ?? "failed" },
      });
    }

    return { ok: true, status: finalStatus };
  } catch (e: any) {
    if (e instanceof CancelledFailure) {
      finalStatus = "canceled";
      await writeEvent({
        runId,
        type: "STEP_CANCELED",
        payload: { step: "runner_session", programHash },
      });
      await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "canceled" } });
      throw e;
    }

    finalStatus = "failed";

    await writeEvent({
      runId,
      type: "ERROR",
      payload: { ...errPayload(e), step: "runner_session" },
    });

    await writeEvent({
      runId,
      type: "STEP_FAILED",
      payload: { step: "runner_session", programHash, error: errPayload(e) },
    });

    await writeEvent({ runId, type: "RUN_STATUS", payload: { status: "failed" } });

    throw e;
  } finally {
    // ✅ single authoritative DB status write here
    try {
      await setRunStatus({ runId, status: finalStatus });
    } catch (e) {
      await writeEvent({
        runId,
        type: "ERROR",
        payload: { ...errPayload(e), where: "setRunStatus(finally)" },
      });
    }

    // ✅ always settle billing, never mask original outcome
    try {
      await settleRunBilling({ runId, status: finalStatus, usage });
    } catch (e) {
      await writeEvent({
        runId,
        type: "ERROR",
        payload: { ...errPayload(e), where: "settleRunBilling(finally)" },
      });
    }
  }
}