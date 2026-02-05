// worker/activities.ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db"; // if worker shares TS path. Otherwise copy db client into worker.
import { appendRunEvent, upsertBinding } from "@/lib/sse";

export async function setRunStatus(args: { runId: string; status: schema.RunStatus }) {
  await db
    .update(schema.runs)
    .set({ status: args.status, updatedAt: new Date() })
    .where(eq(schema.runs.id, args.runId as any));
}

export async function writeEvent(args: { runId: string; type: schema.RunEventType; payload: any }) {
  await appendRunEvent(args.runId, args.type, args.payload);
}

export async function fakeSession(args: { runId: string }) {
  // 1) create a todo list (v1: just 3 defaults)
  const todos = [
    { text: "Read task scope + deliverables", order: 0 },
    { text: "Gather required context + files", order: 1 },
    { text: "Produce deliverables + summarize", order: 2 },
  ];

  for (const t of todos) {
    const inserted = await db
      .insert(schema.todos)
      .values({ runId: args.runId as any, text: t.text, order: t.order })
      .returning({ id: schema.todos.id });

    await appendRunEvent(args.runId, "TODO_CREATED", { todoId: inserted[0]!.id, text: t.text, order: t.order });
  }

  // 2) write a dummy binding like the Prose VM expects
  const bindingId = await upsertBinding({
    runId: args.runId,
    name: "fake_result",
    kind: "let",
    executionId: null,
    sourceProse: `let fake_result = session "Fake session"`,
    contentPreview: "Hello from fake session.",
    summary: "Wrote fake_result binding + seeded todos.",
  });

  await appendRunEvent(args.runId, "BINDING_WRITTEN", {
    name: "fake_result",
    bindingId,
    summary: "Wrote fake_result binding + seeded todos.",
  });
}