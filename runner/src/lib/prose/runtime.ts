// runner/src/prose/runtime.ts
import type { ProseProgram, Stmt, Expr } from "./ast";
import type { RuntimeState, BindingRef } from "./state";
import { renderSessionPrompt } from "./prompts";
import type { SessionAdapter, AgentEvent } from "./sessionAdapter";
import { putText, getTextIfExists } from "../../s3";
import { EventBuffer } from "../events/client";

// ✅ Phase 1 tools
import { buildRegistry } from "./tools/catalog";
import { ToolRunner } from "./tools/runner";
import type { ToolCtx } from "./tools/types";

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

  const workspaceDir =
    (manifest.env?.WORKSPACE_DIR && String(manifest.env.WORKSPACE_DIR)) ||
    process.env.WORKSPACE_DIR ||
    process.cwd();

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

  // ✅ Tool registry + runner (Phase 1)
  const registry = buildRegistry();

  const toolRunner = new ToolRunner(registry, (ev: any) => {
    // Translate any tool-runner events to your canonical AgentEvent step shape
    // (ToolRunner in earlier plan emits {type:"step", op:"start"/"finish"...}; normalize here.)
    if (ev?.type === "step" && ev?.op === "start") {
      eventBuf.enqueue(
        { type: "step", status: "started", name: String(ev.name ?? ev.toolName ?? "tool"), detail: String(ev.detail ?? "") } as any,
        undefined,
        { agentName: "system" }
      );
      return;
    }
    if (ev?.type === "step" && ev?.op === "finish") {
      eventBuf.enqueue(
        {
          type: "step",
          status: ev.ok ? "completed" : "failed",
          name: String(ev.name ?? ev.toolName ?? "tool"),
          detail: String(ev.detail ?? ""),
          data: ev.error ? { error: ev.error } : undefined,
        } as any,
        undefined,
        { agentName: "system" }
      );
      return;
    }

    // If it's already in AgentEvent shape, forward.
    eventBuf.enqueue(ev as any, undefined, { agentName: "system" });
  });

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

    // ✅ Tool context for this agent/session
    const toolAllowlist = new Set<string>(manifest.toolAllowlist ?? []);
    const capabilities = new Set<string>(manifest.capabilities ?? []);

    const allowedDomains = new Set<string>();
    // Phase 1: allow all only if explicitly toggled
    if (capabilities.has("net.egress") && (manifest.env?.NET_ALLOW_ALL === "1" || process.env.NET_ALLOW_ALL === "1")) {
      allowedDomains.add("*");
    }

    const toolCtx: ToolCtx = {
      runId: st.runId,
      programHash: st.programHash,
      principalId,
      agentName,
      sessionId: priorSessionId ?? undefined,
      workspaceDir,

      toolAllowlist,
      capabilities,

      filePolicy: {
        allowed: manifest.files?.map((f) => ({ path: f.path, mode: f.mode })) ?? [],
        maxFileBytes: manifest.limits?.maxFileBytes ?? 50 * 1024 * 1024,
      },

      netPolicy: { allowedDomains },

      controlPlaneBaseUrl:
        process.env.CONTROL_PLANE_BASE_URL ||
        manifest.env?.CONTROL_PLANE_BASE_URL ||
        undefined,

      runnerSharedSecret:
        process.env.RUNNER_SHARED_SECRET ||
        manifest.env?.RUNNER_SHARED_SECRET ||
        undefined,
    };

    const toolHandler = async (call: { name: string; input: unknown; toolUseId?: string }) => {
      const r = await toolRunner.run(toolCtx, { name: call.name, input: call.input, toolUseId: call.toolUseId });
      if ((r as any)?.ok) return { ok: true as const, output: (r as any).output };
      return { ok: false as const, error: (r as any).error ?? { code: "tool_failed", message: "tool_failed" } };
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
            runId: st.runId,
            workspaceDir,
            toolHandler,
          })
        : await adapter.createSession({
            model: agent?.model,
            system: promptParts.system,
            memoryText: wantsResume ? memoryText ?? null : null,
            idempotencyKey: `${st.runId}:${agentKey}:create`,
            principalId,
            agentName,
            runId: st.runId,
            workspaceDir,
            toolHandler,
          });

    await session.send(promptParts.user);

    let full = "";
    let latestSessionId: string | undefined;

    let didAnnounceSession = false;

    let lastResultTextFromEvents: string | undefined;

    const todoAddIds = new Set<string>();
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

    const fallback = extractResultText(full);
    const finalResult = lastResultTextFromEvents ?? fallback;

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