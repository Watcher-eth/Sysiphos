// runner/src/prose/runtime.ts
import type { ProseProgram, Stmt, Expr } from "./ast";
import type { RuntimeState, BindingRef } from "./state";
import { renderSessionPrompt } from "./prompts";
import type { SessionAdapter, AgentEvent } from "./sessionAdapter";
import { putText, getTextIfExists } from "../../s3";
import { EventBuffer } from "../events/client";

type Manifest = {
  runId: string;
  programHash: string;
  programText: string;
  principalId?: string;

  toolAllowlist: string[];
  capabilities: string[];

  files: Array<{
    contentRef: string;
    path: string;
    mode: "ro" | "rw";
    sha256?: string | null;
  }>;

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

function s3AgentMemoryKey(runId: string, principalId: string, agentName: string) {
  return `${process.env.S3_PREFIX ?? "runs"}/${runId}/principals/${principalId}/agents/${agentName}/memory.md`;
}

function extractResultText(raw: string) {
  const m = raw.match(/<result>([\s\S]*?)<\/result>/);
  if (!m) return raw.trim();
  return m[1].trim();
}

function isPersistEnabled(persist?: string): boolean {
  if (!persist) return false;
  const p = persist.trim().toLowerCase();
  if (!p) return false;
  if (p === "false" || p === "0" || p === "off" || p === "no") return false;
  return true;
}

function parseSessionIdFromMemory(memoryText: string | null): string | undefined {
  if (!memoryText) return undefined;
  const m = memoryText.match(/^\s*session_id:\s*([^\n]+)\s*$/m);
  return m ? m[1].trim() : undefined;
}

function keyForAgent(principalId: string, agentName: string) {
  return `${principalId}:${agentName}`;
}

function isTodoAdd(ev: any): ev is { type: "todo"; op: "add"; id?: string; text?: string } {
  return ev?.type === "todo" && ev?.op === "add";
}

function artifactKey(ev: any): string | null {
  if (!ev || typeof ev !== "object") return null;
  const contentRef = typeof ev.contentRef === "string" && ev.contentRef ? ev.contentRef : "";
  const path = typeof ev.path === "string" && ev.path ? ev.path : "";
  const name = typeof ev.name === "string" && ev.name ? ev.name : "";
  if (contentRef) return `ref:${contentRef}`;
  if (path) return `path:${path}`;
  if (name) return `name:${name}`;
  return null;
}

const MIN_TODOS = 5;
const SYNTH_TODOS = [
  "Gather context & constraints",
  "Write a plan (steps + risks)",
  "Execute the plan",
  "Verify outputs & edge cases",
  "Finalize result & next actions",
];

export async function executeProse(args: {
  manifest: Manifest;
  program: ProseProgram;
  adapter: SessionAdapter;
}): Promise<ExecResult> {
  const startedAt = Date.now();
  const { manifest, program, adapter } = args;

  const principalId = (manifest.principalId?.trim() || "system").slice(0, 128);

  const st: RuntimeState & { agentSessionIds: Map<string, string> } = {
    runId: manifest.runId,
    programHash: manifest.programHash,
    bindings: new Map(),
    outputs: [],
    agentSessionIds: new Map(),
  };

  const eventBuf = new EventBuffer(
    { v: 1, runId: manifest.runId, programHash: manifest.programHash, principalId, agentName: "system" },
    { flushEveryMs: 500, maxBatch: 50, maxQueue: 2000 }
  );

  eventBuf.start();

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
    const agentName = args2.agentName ?? "default";
    const agent = args2.agentName ? program.agents[args2.agentName] : undefined;

    const persistOn = isPersistEnabled(agent?.persist);
    const wantsResume = Boolean(args2.isResume && args2.agentName && persistOn);

    const agentKey = keyForAgent(principalId, agentName);

    const memoryKey = wantsResume ? s3AgentMemoryKey(st.runId, principalId, agentName) : null;
    const memoryText = memoryKey ? await getTextIfExists(memoryKey) : null;

    const priorSessionId =
      wantsResume ? st.agentSessionIds.get(agentKey) ?? parseSessionIdFromMemory(memoryText) : undefined;

    if (priorSessionId && persistOn) st.agentSessionIds.set(agentKey, priorSessionId);

    const emit = (event: AgentEvent, usage?: any, sessionId?: string) => {
      eventBuf.enqueue(event, usage, { agentName, sessionId });
    };

    const contextRefs = Array.from(st.bindings.values()).map((b) => ({ name: b.name, contentRef: b.contentRef }));

    const promptParts = renderSessionPrompt({
      title: args2.title,
      agentSystem: agent?.prompt,
      contextRefs,
      examples: undefined,
    });

    const session =
      wantsResume && priorSessionId
        ? await adapter.resumeSession({
            sessionId: priorSessionId,
            model: agent?.model,
            system: promptParts.system,
            memoryText,
            idempotencyKey: `${st.runId}:${agentKey}:resume`,
            principalId,
            agentName,
          })
        : await adapter.createSession({
            model: agent?.model,
            system: promptParts.system,
            memoryText: wantsResume ? memoryText ?? null : null,
            idempotencyKey: `${st.runId}:${agentKey}:create`,
            principalId,
            agentName,
          });

    await session.send(promptParts.user);

    let full = "";
    let latestSessionId: string | undefined;

    let didAnnounceSession = false;

    // 5.5: structured output is the source of truth
    let lastResultTextFromEvents: string | undefined;

    // 5.5: unique TODO counting (covers streamed + structured)
    const todoAddIds = new Set<string>();

    // 5.5: artifact dedupe (covers streamed + structured)
    const seenArtifacts = new Set<string>();

    const handleEvent = (ev: any, usage?: any) => {
      if (!ev) return;

      if (ev.type === "session_started" || ev.type === "session_resumed") {
        didAnnounceSession = true;
      }

      if (isTodoAdd(ev)) {
        if (typeof ev.id === "string" && ev.id) {
          todoAddIds.add(ev.id);
        } else if (typeof ev.text === "string" && ev.text.trim()) {
          todoAddIds.add(`text:${ev.text.trim()}`);
        }
      }

      if (ev.type === "artifact") {
        const key = artifactKey(ev);
        if (key) {
          if (seenArtifacts.has(key)) return;
          seenArtifacts.add(key);
        }
      }

      if (ev.type === "result_text") {
        const t = typeof ev.text === "string" ? ev.text.trim() : "";
        if (t) lastResultTextFromEvents = t;
      }

      emit(ev as any, usage, latestSessionId);
    };

    try {
      for await (const msg of session.stream()) {
        latestSessionId = msg.sessionId ?? latestSessionId;

        if (latestSessionId && !didAnnounceSession) {
          didAnnounceSession = true;
          handleEvent(
            args2.isResume
              ? ({ type: "session_resumed", sessionId: latestSessionId } as any)
              : ({ type: "session_started", sessionId: latestSessionId } as any)
          );
        }

        if (msg.event) handleEvent(msg.event, msg.usage);

        // keep raw text for debugging + fallback-only result extraction
        if (msg.text) full += msg.text;

        usageAgg.tokensIn += msg.usage?.tokensIn ?? 0;
        usageAgg.tokensOut += msg.usage?.tokensOut ?? 0;
        usageAgg.costCredits += msg.usage?.costCredits ?? 0;
      }
    } finally {
      try {
        session.close();
      } catch {}
    }

    // --- TODO enforcement (unique + no duplicates) ---
    if (todoAddIds.size < MIN_TODOS) {
      const sid = latestSessionId;
      const synthPrefix = `synth:${agentName}:${sid ?? "nosid"}`;
      for (let i = 0; i < MIN_TODOS; i++) {
        handleEvent(
          {
            type: "todo",
            op: "add",
            id: `${synthPrefix}:t${i + 1}`,
            text: SYNTH_TODOS[i] ?? `Task ${i + 1}`,
            status: "not_started",
            data: { synthetic: true },
          } as any,
          undefined
        );
      }
    }

    // --- FINAL RESULT (structured wins) ---
    // If we got result_text event, that is authoritative. Otherwise fallback to <result>.
    const fallback = extractResultText(full);
    const finalResult = lastResultTextFromEvents ?? fallback;

    // Emit result_text event only if structured did NOT produce it.
    if (!lastResultTextFromEvents) {
      handleEvent({ type: "result_text", text: finalResult } as any, undefined);
    }

    if (persistOn && latestSessionId) st.agentSessionIds.set(agentKey, latestSessionId);

    if (persistOn) {
      const sidLine = latestSessionId ? `session_id: ${latestSessionId}\n` : "";
      const mem =
        `# memory\n\n` +
        sidLine +
        `principal_id: ${principalId}\n` +
        `agent: ${agentName}\n` +
        `last_task: ${args2.title}\n` +
        `updated_at: ${new Date().toISOString()}\n`;
      const key = s3AgentMemoryKey(st.runId, principalId, agentName);
      await putText(key, mem, "text/markdown");
    }

    return finalResult;
  }

  async function execStmt(stmt: Stmt): Promise<void> {
    switch (stmt.kind) {
      case "comment":
        return;

      case "session":
        await runSession({ title: stmt.title, agentName: stmt.agentName, isResume: false });
        return;

      case "resume":
        await runSession({ title: stmt.title, agentName: stmt.agentName, isResume: true });
        return;

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
              await writeBinding({ name: stmt.catchName, kind: "let", contentRef: "", mime: "text/plain" }, msg);
            }
            for (const s of stmt.catchBody) await execStmt(s);
          } else {
            throw err;
          }
        } finally {
          if (stmt.finallyBody) for (const s of stmt.finallyBody) await execStmt(s);
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
        for (let k = 0; k < stmt.n; k++) for (const s of stmt.body) await execStmt(s);
        return;
      }

      default:
        // @ts-expect-error exhaustiveness
        throw new Error(`runtime_unhandled_stmt: ${stmt.kind}`);
    }
  }

  try {
    for (const stmt of program.statements) await execStmt(stmt);
  } finally {
    await eventBuf.flushAllAndStop().catch(() => {});
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