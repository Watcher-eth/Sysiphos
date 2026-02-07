// worker/src/workflows.ts
import * as wf from "@temporalio/workflow";
import { CancelledFailure } from "@temporalio/workflow";
import type * as acts from "./activities";

export type ProseRunArgs = { runId: string; programHash: string };
type RunFinalStatus = "succeeded" | "failed" | "canceled";

const { setRunStatus, writeEvent, createTodo, settleRunBilling, SpawnSessionAndWait } =
  wf.proxyActivities<typeof acts>({
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

  await writeEvent({
    runId,
    programHash,
    principalId: "system",
    event: { type: "RUN_STATUS", status: "running" }, // or {type:"log"...}; mapper can handle either
  });

  await createTodo({ runId, order: 0, text: "Collect context + constraints", externalId: "wf:t1" });
  await createTodo({ runId, order: 1, text: "Execute task plan", externalId: "wf:t2" });
  await createTodo({ runId, order: 2, text: "Write deliverables + finalize", externalId: "wf:t3" });

  let finalStatus: RunFinalStatus = "failed";
  let usage: any = null;

  try {
    await writeEvent({
      runId,
      programHash,
      principalId: "system",
      event: { type: "step", status: "started", id: "runner_session", name: "runner_session", data: { programHash } },
    });

    const resp = await SpawnSessionAndWait({ runId, programHash });
    usage = resp?.usage ?? null;

    if (resp?.status === "succeeded") {
      finalStatus = "succeeded";
      await writeEvent({
        runId,
        programHash,
        principalId: "system",
        event: { type: "step", status: "completed", id: "runner_session", name: "runner_session", data: { programHash } },
      });
      return { ok: true, status: finalStatus };
    }

    finalStatus = "failed";
    await writeEvent({
      runId,
      programHash,
      principalId: "system",
      event: { type: "step", status: "failed", id: "runner_session", name: "runner_session", data: { programHash, runnerStatus: resp?.status ?? "failed" } },
    });

    return { ok: false, status: finalStatus };
  } catch (e: any) {
    if (e instanceof CancelledFailure) {
      finalStatus = "canceled";
      await writeEvent({
        runId,
        programHash,
        principalId: "system",
        event: { type: "step", status: "canceled", id: "runner_session", name: "runner_session", data: { programHash } },
      });
      await writeEvent({ runId, programHash, principalId: "system", event: { type: "RUN_STATUS", status: "canceled" } });
      throw e;
    }

    finalStatus = "failed";
    await writeEvent({
      runId,
      programHash,
      principalId: "system",
      event: { type: "error", message: "runner_session_failed", data: { ...errPayload(e), step: "runner_session" } },
    });
    await writeEvent({ runId, programHash, principalId: "system", event: { type: "RUN_STATUS", status: "failed" } });
    throw e;
  } finally {
    try {
      await setRunStatus({ runId, status: finalStatus });
    } catch {}

    try {
      await settleRunBilling({ runId, status: finalStatus, usage });
    } catch {}
  }
}