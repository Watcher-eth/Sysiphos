import { createHash } from "node:crypto";

type TaskShape = {
  id: string;
  title: string;
  description: string;
  deliverablesSpec: any[];
  contextSpec: any[];
  mountsSpec: any[];
};

function stableJson(x: any): string {
  return JSON.stringify(x, Object.keys(x).sort());
}

export function compileTaskToProse(task: TaskShape) {
  // v0 deterministic program (later: real Prose)
  const programText =
`# ${task.title}
# source: task:${task.id}

session "${task.title}"

# v0 program contract:
# - emit 3 todos
# - produce binding "result"
# - succeed
output result = "runner://result"
`;

  const programHash = createHash("sha256").update(programText).digest("hex");
  return { programText, programHash };
}