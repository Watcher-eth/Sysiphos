// runner/src/prose/runtime.ts
import type { ProseProgram, Stmt, Expr } from "./ast";
import type { RuntimeState, BindingRef } from "./state";
import { renderSessionPrompt } from "./prompts";
import type { SessionAdapter, AgentEvent, ToolDefForModel } from "./sessionAdapter";
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

  mcpServers?: Record<string, any>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;

  tools?: ToolDefForModel[]; // signed custom tools exposed to model
  env: Record<string, string>;

  limits: { wallClockMs: number; maxFileBytes: number; maxArtifactBytes: number };
  manifestHash: string;
  manifestSig: string;
};

function canonicalBaseForVerify(m: Manifest) {
  return {
    runId: m.runId,
    programHash: m.programHash,
    programText: m.programText,
    toolAllowlist: m.toolAllowlist,
    capabilities: m.capabilities,
    files: m.files,
    env: m.env,
    limits: m.limits,

    tools: m.tools ?? null,
    mcpServers: m.mcpServers ?? null,
    permissionMode: m.permissionMode ?? null,
  };
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableJson(value[k])).join(",")}}`;
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function mustRunnerSharedSecret() {
  const s = process.env.RUNNER_SHARED_SECRET;
  if (!s) throw new Error("RUNNER_SHARED_SECRET missing");
  return s;
}


function verifyManifestOrThrow(manifest: Manifest) {
  const canon = stableJson(canonicalBaseForVerify(manifest));
  const hash = sha256Hex(canon);

  if (!manifest.manifestHash || !manifest.manifestSig) {
    throw new Error("manifest_missing_sig");
  }
  if (hash !== manifest.manifestHash) {
    throw new Error("manifest_hash_mismatch");
  }

  const secret = mustRunnerSharedSecret();
  const expectedSig = hmacHex(secret, manifest.manifestHash);

  const a = Buffer.from(expectedSig, "hex");
  const b = Buffer.from(manifest.manifestSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("manifest_sig_invalid");
  }
}

type ExecResult = {
  outputs: BindingRef[];
  usage: {
    wallClockMs: number;
    tokensIn?: number;
    tokensOut?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    totalCostUsd?: number;
    modelUsage?: Record<string, any>;
    costCredits?: number;
  };
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

function matchesMcpAllow(entry: string, toolName: string): boolean {
  // entry like "mcp__server__tool" OR "mcp__server__*" OR "mcp__*__*"
  const m = entry.match(/^mcp__(\*|[^_]+)__(\*|.+)$/);
  if (!m) return false;

  const [, serverPat, toolPat] = m;
  const m2 = toolName.match(/^mcp__([^_]+)__(.+)$/);
  if (!m2) return false;

  const [, server, tool] = m2;
  const serverOk = serverPat === "*" || serverPat === server;
  const toolOk = toolPat === "*" || toolPat === tool;
  return serverOk && toolOk;
}

function hasAnyMcpAllowance(allowListArr: string[]) {
  return allowListArr.some((n) => typeof n === "string" && n.startsWith("mcp__"));
}

function deriveSessionConfig(manifest: Manifest) {
  const allowArr = (manifest.toolAllowlist ?? []).filter((x) => typeof x === "string" && x.length);
  const allow = new Set<string>(allowArr);

  const mcpAllowedTools = allowArr.filter((n) => n.startsWith("mcp__"));
  const hasMcpAllowance = mcpAllowedTools.length > 0;

  // MCP only enabled if (a) servers exist and (b) allowlist contains at least one mcp__ entry
  const mcpServers = manifest.mcpServers && hasMcpAllowance ? manifest.mcpServers : undefined;

  // Claude SDK expects "allowedTools" patterns for MCP gating
  const allowedTools = hasMcpAllowance ? mcpAllowedTools : undefined;

  // ✅ env is the only place ENABLE_TOOL_SEARCH lives
  const env: Record<string, string> = { ...(manifest.env ?? {}) };

  return {
    allowArr,
    allow,
    mcpServers,
    allowedTools,
    permissionMode: manifest.permissionMode ?? "default",
    env,
    tools: (manifest.tools ?? []) as ToolDefForModel[],
  };
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

export async function executeProse(args: {
  manifest: Manifest;
  program: ProseProgram;
  adapter: SessionAdapter;
}): Promise<ExecResult> {
  const startedAt = Date.now();
  const { manifest, program, adapter } = args;
  verifyManifestOrThrow(manifest);


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

  const usageAgg = {
    tokensIn: 0,
    tokensOut: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalCostUsd: 0,
    costCredits: 0,
    modelUsage: undefined as Record<string, any> | undefined,
  };


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


    const cfg = deriveSessionConfig(manifest);

    const toolHandler = async (call: { name: string; input: unknown; toolUseId?: string }) => {
      const name = String(call?.name ?? "");
    
      // ✅ MCP tools should be executed inside provider SDK, never routed here.
      if (name.startsWith("mcp__")) {
        return {
          ok: false as const,
          error: {
            code: "tool_bug",
            message: `Unexpected MCP tool routed to runner toolHandler: ${name}`,
            data: { tool: name },
          },
        };
      }
    
      // ✅ single source of truth: toolAllowlist
      if (!name || !cfg.allow.has(name)) {
        return {
          ok: false as const,
          error: { code: "tool_denied", message: `Tool not permitted: ${name}`, data: { tool: name } },
        };
      }
    
      // If you want runner-enforced execution, implement it here.
      // Otherwise deny unimplemented local tools.
      return {
        ok: false as const,
        error: { code: "tool_unimplemented", message: `No runner handler for tool: ${name}` },
      };
    };
    
    const contextRefs = Array.from(st.bindings.values()).map((b) => ({ name: b.name, contentRef: b.contentRef }));

    const promptParts = renderSessionPrompt({
      title: args2.title,
      agentSystem: agent?.prompt,
      contextRefs,
      examples: undefined,
    });

    const sessionArgsBase = {
      model: agent?.model,
      system: promptParts.system,
      memoryText: wantsResume ? memoryText ?? null : null,
      idempotencyKey: wantsResume
        ? `${st.runId}:${agentKey}:resume`
        : `${st.runId}:${agentKey}:create`,
      principalId,
      agentName,
      runId: st.runId,
      workspaceDir,
      toolHandler,
      tools: cfg.tools,         // signed custom tools
      _effectiveAllow: cfg.allowArr,
    
      // ✅ MCP passthrough (derived from allowlist)
      mcpServers: cfg.mcpServers,
      allowedTools: cfg.allowedTools,
      permissionMode: cfg.permissionMode,
    
      // ✅ env is the only place tool-search lives
      env: cfg.env,
    };
    
    const session =
      wantsResume && priorSessionId
        ? await adapter.resumeSession({ ...sessionArgsBase, sessionId: priorSessionId } as any)
        : await adapter.createSession(sessionArgsBase as any);

    await session.send(promptParts.user);

    let full = "";
    let latestSessionId: string | undefined;
    let didAnnounceSession = false;
    let lastResultTextFromEvents: string | undefined;

    const seenArtifacts = new Set<string>();
    const seenUsageIds = new Set<string>();

    const handleEvent = (ev: any, usage?: any) => {
      if (!ev) return;

      if (ev.type === "session_started" || ev.type === "session_resumed") {
        didAnnounceSession = true;
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

        if (msg.usage) {
          const messageId = msg.usage.messageId;
          if (!messageId || !seenUsageIds.has(messageId)) {
            if (messageId) seenUsageIds.add(messageId);
            usageAgg.tokensIn += msg.usage.tokensIn ?? 0;
            usageAgg.tokensOut += msg.usage.tokensOut ?? 0;
            usageAgg.cacheReadInputTokens += msg.usage.cacheReadInputTokens ?? 0;
            usageAgg.cacheCreationInputTokens += msg.usage.cacheCreationInputTokens ?? 0;
          }

          if (msg.usage.totalCostUsd != null) {
            usageAgg.totalCostUsd = Math.max(usageAgg.totalCostUsd, Number(msg.usage.totalCostUsd));
          }
          if (msg.usage.modelUsage) usageAgg.modelUsage = msg.usage.modelUsage;
          if (msg.usage.costCredits != null) usageAgg.costCredits += msg.usage.costCredits ?? 0;
        }
      }
    } finally {
      try {
        session.close();
      } catch {}
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
      cacheReadInputTokens: usageAgg.cacheReadInputTokens || undefined,
      cacheCreationInputTokens: usageAgg.cacheCreationInputTokens || undefined,
      totalCostUsd: usageAgg.totalCostUsd || undefined,
      modelUsage: usageAgg.modelUsage ?? undefined,
      costCredits: usageAgg.costCredits || undefined,
    },
  };
}