// src/lib/prose/proseCompiler.ts
import { createHash } from "node:crypto";

export const COMPILER_VERSION = "prose-compiler@0.2.0";

function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function stableStringify(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",")}}`;
}

function renderSpecBlock(label: string, value: any) {
  return `${label}: ${stableStringify(value)}`;
}

function renderReviewNotes(notes?: ReviewNote[]) {
  const arr = (notes ?? []).slice(0, 200);
  return arr.length ? arr : [];
}

function buildAgentPrompt(args: {
  kind: "task" | "workflow_version";
  title?: string;
  description?: string;
  deliverablesSpec?: any[];
  contextSpec?: any[];
  mountsSpec?: any[];
  workflowDefinition?: any;
  reviewNotes?: ReviewNote[];
  executionSpec?: ExecutionSpec;
}) {
  const lines: string[] = [];
  lines.push(
    "You are executing a pinned run. Follow the task spec exactly and produce deliverables that match deliverablesSpec.",
    "Emit artifact events for each deliverable and ensure titles/types align with the spec."
  );
  lines.push("");
  lines.push("<task_spec>");
  lines.push(renderSpecBlock("kind", args.kind));
  if (args.title != null) lines.push(renderSpecBlock("title", args.title));
  if (args.description != null) lines.push(renderSpecBlock("description", args.description));
  if (args.deliverablesSpec != null) lines.push(renderSpecBlock("deliverablesSpec", args.deliverablesSpec));
  if (args.contextSpec != null) lines.push(renderSpecBlock("contextSpec", args.contextSpec));
  if (args.mountsSpec != null) lines.push(renderSpecBlock("mountsSpec", args.mountsSpec));
  if (args.workflowDefinition != null) lines.push(renderSpecBlock("workflowDefinition", args.workflowDefinition));
  lines.push(renderSpecBlock("reviewNotes", renderReviewNotes(args.reviewNotes)));
  lines.push(renderSpecBlock("executionSpec", args.executionSpec ?? null));
  lines.push("</task_spec>");
  return lines.join("\n");
}

export type ReviewNote = {
  id: string;
  createdAt: string;
  authorUserId: string | null;
  targetType: string;
  targetId: string | null;
  body: string;
  runId: string;
};

export type ExecutionSpec = {
  tools?: Array<{ name: string; description?: string; input_schema?: any }>;
  mcpServers?: Record<string, any>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;
  env?: Record<string, string>;
  envAllowlist?: string[];
  limits?: { wallClockMs?: number; maxFileBytes?: number; maxArtifactBytes?: number };
};

export type CompileInput =
  | {
      kind: "task";
      task: {
        id: string;
        title: string;
        description: string;
        deliverablesSpec: any[];
        contextSpec: any[];
        mountsSpec: any[];
      };
      // ✅ evolving layer
      reviewNotes?: ReviewNote[];
      // ✅ optionally let tooling policy influence compilation
      executionSpec?: ExecutionSpec;
    }
  | {
      kind: "workflow_version";
      workflowVersion: {
        id: string;
        workflowId: string;
        version: number;
        definition: any;
      };
      reviewNotes?: ReviewNote[];
      executionSpec?: ExecutionSpec;
    };

export type CompileResult = {
  compilerVersion: string;
  sourceHash: string;
  programText: string;
  programHash: string;
  compilerInputsJson: string;
};

function renderReviewBlock(notes?: ReviewNote[]) {
  const arr = (notes ?? []).slice(0, 200); // hard cap for safety
  if (!arr.length) return "";
  const lines = arr.map((n) => `- (${n.createdAt}) ${n.body.replace(/\s+/g, " ").trim()}`);
  return `\n# review_notes\n${lines.join("\n")}\n`;
}

export function compileToProse(input: CompileInput): CompileResult {
  // ✅ canonical compiler inputs (this is what sourceHash covers)
  const canonical = (() => {
    if (input.kind === "task") {
      const t = input.task;
      return {
        kind: "task",
        id: t.id,
        title: t.title,
        description: t.description ?? "",
        deliverablesSpec: t.deliverablesSpec ?? [],
        contextSpec: t.contextSpec ?? [],
        mountsSpec: t.mountsSpec ?? [],
        reviewNotes: input.reviewNotes ?? [],
        executionSpec: input.executionSpec ?? null,
      };
    }
    const w = input.workflowVersion;
    return {
      kind: "workflow_version",
      id: w.id,
      workflowId: w.workflowId,
      version: w.version,
      definition: w.definition ?? {},
      reviewNotes: input.reviewNotes ?? [],
      executionSpec: input.executionSpec ?? null,
    };
  })();

  const compilerInputsJson = stableStringify(canonical);
  const sourceHash = sha256Hex(compilerInputsJson);

  // ✅ deterministic program emitter
  // For v0, we incorporate review notes as comments in program text (so it influences programHash).
  // Later you can translate review notes into actual structured Prose controls.
  const reviewBlock = renderReviewBlock(input.reviewNotes);

  const agentPrompt =
    input.kind === "task"
      ? buildAgentPrompt({
          kind: "task",
          title: input.task.title,
          description: input.task.description ?? "",
          deliverablesSpec: input.task.deliverablesSpec ?? [],
          contextSpec: input.task.contextSpec ?? [],
          mountsSpec: input.task.mountsSpec ?? [],
          reviewNotes: input.reviewNotes,
          executionSpec: input.executionSpec,
        })
      : buildAgentPrompt({
          kind: "workflow_version",
          workflowDefinition: input.workflowVersion.definition ?? {},
          reviewNotes: input.reviewNotes,
          executionSpec: input.executionSpec,
        });

  const programText =
`# generated by ${COMPILER_VERSION}
# source_hash: ${sourceHash}
${reviewBlock}
agent captain:
  model: sonnet
  prompt: """
${agentPrompt}
"""

# v0 starter program (deterministic)
session "Collect context + constraints"
session "Execute task plan"
output result = session "Write deliverables + finalize"
`;

  const programHash = sha256Hex(programText);

  return {
    compilerVersion: COMPILER_VERSION,
    sourceHash,
    programText,
    programHash,
    compilerInputsJson,
  };
}