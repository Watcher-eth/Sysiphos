// runner/src/prose/runtime.ts
import type { ProseProgram, Stmt, Expr } from "./ast";
import type { RuntimeState, BindingRef } from "./state";
import { renderSessionPrompt } from "./prompts";
import type { SessionAdapter, SessionTurnResult } from "./sessionAdapter";
import { putText, getTextIfExists } from "../s3";

type Manifest = {
  runId: string;
  programHash: string;
  programText: string;
  toolAllowlist: string[];
  capabilities: string[];
  files: Array<{ contentRef: string; path: string; mode: "ro" | "rw"; sha256?: string | null }>;
  env: Record<string, string>;
  limits: { wallClockMs: number; maxFileBytes: number; maxArtifactBytes: number };
};

type ExecResult = {
  outputs: BindingRef[];
  usage: { wallClockMs: number; tokensIn?: number; tokensOut?: number; costCredits?: number };
};

function s3BindingKey(runId: string, name: string) {
  return `${process.env.S3_PREFIX ?? "runs"}/${runId}/bindings/${name}.txt`;
}

function s3AgentMemoryKey(runId: string, agentName: string) {
  return `${process.env.S3_PREFIX ?? "runs"}/${runId}/agents/${agentName}/memory.md`;
}

function extractResultText(raw: string) {
  const m = raw.match(/<result>([\s\S]*?)<\/result>/);
  if (!m) return raw.trim();
  return m[1].trim();
}

function isPersistEnabled(persist?: string): boolean {
  if (!persist) return false;
  // In OpenProse syntax, persist can be "true" | "project" | "user" | custom string path.
  // In runner, anything set means “persist on”.
  return persist === "true" || persist === "project" || persist === "user" || persist.length > 0;
}

export async function executeProse(args: {
  manifest: Manifest;
  program: ProseProgram;
  adapter: SessionAdapter;
}): Promise<ExecResult> {
  const startedAt = Date.now();
  const { manifest, program, adapter } = args;

  const st: RuntimeState & { agentSessionIds: Map<string, string> } = {
    runId: manifest.runId,
    programHash: manifest.programHash,
    bindings: new Map(),
    outputs: [],
    agentSessionIds: new Map(),
  };

  const usageAgg = { tokensIn: 0, tokensOut: 0, costCredits: 0 };

  async function writeBinding(binding: BindingRef, contentText: string) {
    const key = s3BindingKey(st.runId, binding.name);
    const put = await putText(key, contentText, binding.mime ?? "text/plain");
    const updated: BindingRef = {
      ...binding,
      contentRef: put.contentRef,
      sha256: put.sha256,
      size: put.size,
      mime: put.mime,
      preview: contentText.slice(0, 200),
    };
    st.bindings.set(binding.name, updated);
    if (binding.kind === "output") st.outputs.push(updated);
    return updated;
  }

  async function evalExpr(expr: Expr): Promise<{ text?: string; ref?: BindingRef }> {
    if (expr.kind === "string") return { text: expr.value };
    if (expr.kind === "var") {
      const ref = st.bindings.get(expr.name);
      if (!ref) throw new Error(`runtime_unknown_var: ${expr.name}`);
      return { ref };
    }
    if (expr.kind === "call_session") {
      const text = await runSession({ title: expr.title, agentName: expr.agentName, isResume: false });
      return { text };
    }
    if (expr.kind === "call_resume") {
      const text = await runSession({ title: expr.title, agentName: expr.agentName, isResume: true });
      return { text };
    }
    return {};
  }

  async function runSession(args2: { title: string; agentName?: string; isResume: boolean }): Promise<string> {
    const agent = args2.agentName ? program.agents[args2.agentName] : undefined;

    const persistOn = isPersistEnabled(agent?.persist);
    const shouldLoadMemory = args2.isResume && args2.agentName && persistOn;

    // Runner “agent memory” (your own file) is separate from Claude “session resume”.
    const memoryKey = shouldLoadMemory ? s3AgentMemoryKey(st.runId, args2.agentName!) : null;
    const memoryText = memoryKey ? await getTextIfExists(memoryKey) : null;

    const contextRefs = Array.from(st.bindings.values()).map((b) => ({
      name: b.name,
      contentRef: b.contentRef,
    }));

    const promptParts = renderSessionPrompt({
      title: args2.title,
      agentSystem: agent?.prompt,
      contextRefs,
      examples: undefined,
    });

    // Claude session resume (V2):
    // if we have an existing sessionId for this agent and caller requested resume, use it
    const priorSessionId =
      args2.isResume && args2.agentName ? st.agentSessionIds.get(args2.agentName) : undefined;

    const session = priorSessionId
      ? await adapter.resumeSession({
          sessionId: priorSessionId,
          model: agent?.model,
          system: promptParts.system,
          memoryText,
        })
      : await adapter.createSession({
          model: agent?.model,
          system: promptParts.system,
          memoryText: memoryText ?? null,
        });

    await session.send(promptParts.user);

    let full = "";
    let latestSessionId: string | undefined;

    for await (const msg of session.stream()) {
      full += msg.text ?? "";
      latestSessionId = msg.sessionId ?? latestSessionId;

      usageAgg.tokensIn += msg.usage?.tokensIn ?? 0;
      usageAgg.tokensOut += msg.usage?.tokensOut ?? 0;
      usageAgg.costCredits += msg.usage?.costCredits ?? 0;
    }

    session.close();

    // Persist Claude sessionId for this agent if persist is enabled
    if (args2.agentName && persistOn && latestSessionId) {
      st.agentSessionIds.set(args2.agentName, latestSessionId);
    }

    // Memory writeback (run-scoped) for persistent agents only
    if (args2.agentName && persistOn) {
      const mem =
        `# memory\n\n` +
        `last_task: ${args2.title}\n` +
        `updated_at: ${new Date().toISOString()}\n` +
        (latestSessionId ? `session_id: ${latestSessionId}\n` : "");
      const key = s3AgentMemoryKey(st.runId, args2.agentName);
      await putText(key, mem, "text/markdown");
    }

    return extractResultText(full);
  }

  async function execStmt(stmt: Stmt): Promise<void> {
    switch (stmt.kind) {
      case "comment":
        return;

      case "session": {
        await runSession({ title: stmt.title, agentName: stmt.agentName, isResume: false });
        return;
      }

      case "resume": {
        await runSession({ title: stmt.title, agentName: stmt.agentName, isResume: true });
        return;
      }

      case "let": {
        const v = await evalExpr(stmt.expr);
        const text = v.text ?? (v.ref ? `ref:${v.ref.contentRef}` : "");
        await writeBinding({ name: stmt.name, kind: "let", contentRef: "", mime: "text/plain" }, text);
        return;
      }

      case "output": {
        const v = await evalExpr(stmt.expr);
        const text = v.text ?? (v.ref ? `ref:${v.ref.contentRef}` : "");
        await writeBinding({ name: stmt.name, kind: "output", contentRef: "", mime: "text/plain" }, text);
        return;
      }

      case "try": {
        try {
          for (const s of stmt.body) await execStmt(s);
        } catch (err: any) {
          if (stmt.catchBody) {
            const msg = String(err?.message ?? err);
            if (stmt.catchName) {
              await writeBinding(
                { name: stmt.catchName, kind: "let", contentRef: "", mime: "text/plain" },
                msg
              );
            }
            for (const s of stmt.catchBody) await execStmt(s);
          } else {
            throw err;
          }
        } finally {
          if (stmt.finallyBody) {
            for (const s of stmt.finallyBody) await execStmt(s);
          }
        }
        return;
      }

      case "parallel": {
        const tasks = stmt.branches.map(async (b) => {
          if (b.name && b.stmt.kind === "session") {
            const text = await runSession({ title: b.stmt.title, agentName: b.stmt.agentName, isResume: false });
            await writeBinding({ name: b.name, kind: "let", contentRef: "", mime: "text/plain" }, text);
            return;
          }
          if (b.name && b.stmt.kind === "resume") {
            const text = await runSession({ title: b.stmt.title, agentName: b.stmt.agentName, isResume: true });
            await writeBinding({ name: b.name, kind: "let", contentRef: "", mime: "text/plain" }, text);
            return;
          }
          await execStmt(b.stmt);
        });

        if (stmt.onFail === "ignore") {
          await Promise.allSettled(tasks);
          return;
        }

        if (stmt.onFail === "continue") {
          const settled = await Promise.allSettled(tasks);
          const errs = settled.filter((s) => s.status === "rejected") as PromiseRejectedResult[];
          if (errs.length) throw errs[0].reason;
          return;
        }

        await Promise.all(tasks);
        return;
      }

      case "repeat": {
        for (let k = 0; k < stmt.n; k++) {
          for (const s of stmt.body) await execStmt(s);
        }
        return;
      }

      default:
        // @ts-expect-error exhaustiveness
        throw new Error(`runtime_unhandled_stmt: ${stmt.kind}`);
    }
  }

  for (const stmt of program.statements) {
    await execStmt(stmt);
  }

  const wallClockMs = Date.now() - startedAt;
  return {
    outputs: st.outputs,
    usage: {
      wallClockMs,
      tokensIn: usageAgg.tokensIn || undefined,
      tokensOut: usageAgg.tokensOut || undefined,
      costCredits: usageAgg.costCredits || undefined,
    },
  };
}