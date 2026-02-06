export const PROSE_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "prose";
export const PROSE_RUN_WORKFLOW_NAME = "ProseRunWorkflow";

export function proseWorkflowId(runId: string) {
  return `prose-run:${runId}`;
}