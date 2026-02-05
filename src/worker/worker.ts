// worker/worker.ts
import { Worker } from "@temporalio/worker";
import * as activities from "./activities";

async function main() {
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "prose";

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue,
  });

  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});