import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "prose";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  while (true) {
    try {
        const connection = await NativeConnection.connect({
            address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
          });
          
          const worker = await Worker.create({
            connection,
            namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
            taskQueue: TASK_QUEUE,
            workflowsPath: require.resolve("./workflows"),
            activities,
          });
      console.log("[worker] TEMPORAL_ADDRESS =", process.env.TEMPORAL_ADDRESS);
console.log("[worker] TEMPORAL_NAMESPACE =", process.env.TEMPORAL_NAMESPACE);
console.log("[worker] TASK_QUEUE =", TASK_QUEUE);

      console.log(`[temporal-worker] RUNNING taskQueue=${TASK_QUEUE}`);
      await worker.run();
      return;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      console.error("[temporal-worker] connect/run failed:", msg);
      // retry on connection refused / transient startup issues
      if (msg.includes("Connection refused") || msg.includes("ECONNREFUSED")) {
        await sleep(500);
        continue;
      }
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("[temporal-worker] fatal:", err);
  process.exit(1);
});