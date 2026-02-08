// runner/src/prose/adapters/claudeV2.ts
import type {
  AgentEvent,
  SessionAdapter,
  SessionCreateArgs,
  SessionHandle,
  SessionTurnResult,
} from "../sessionAdapter";

import { WorkspaceFiles } from "../../files/fileOps";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { EventBuffer } from "../../events/buffer";

const NATIVE_TOOLS: any[] = [
  { type: "bash_20250124", name: "bash" },
  { type: "text_editor_20250728", name: "str_replace_based_edit_tool" },
  // If you want computer-use always enabled:
  // { type: "computer_20251124", name: "computer", display_width_px: 1024, display_height_px: 768, display_number: 1 },

  // If you have web fetch/search tools, include them similarly:
  { type: "web_fetch_20250910", name: "web_fetch", max_uses: 5 },
  { type: "web_search_20250305", name: "web_search", max_uses: 5 },
];

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

async function readFileSafe(absPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(absPath);
  } catch {
    return null;
  }
}

async function statFileSafe(absPath: string): Promise<{ bytes: number; sha: string } | null> {
  const buf = await readFileSafe(absPath);
  if (!buf) return null;
  return { bytes: buf.length, sha: sha256Hex(buf) };
}

function isMutatingTool(tool: string) {
  return (
    tool === "Write" ||
    tool === "Edit" ||
    tool === "Mkdir" ||
    tool === "Rm" ||
    tool === "Move" ||
    tool === "Copy"
  );
}

type FileEvent = Extract<AgentEvent, { type: "file" }>;
type FileOp = FileEvent["op"];

function toolToFileOp(tool: string): FileOp | null {
  switch (tool) {
    case "Write":
      return "created";
    case "Edit":
      return "edited";
    case "Rm":
      return "deleted";
    case "Mkdir":
      return "mkdir";
    case "Move":
      return "moved";
    case "Copy":
      return "copied";
    default:
      return null;
  }
}

function tryGetToolPaths(input: any): { path?: string; toPath?: string } {
  const ti = input?.tool_input ?? input?.toolInput;
  if (!ti || typeof ti !== "object") return {};

  const p =
    ti.path ?? ti.file_path ?? ti.filePath ?? ti.filename ?? ti.file ?? ti.target ?? undefined;
  const to =
    ti.toPath ?? ti.to_path ?? ti.dest ?? ti.destination ?? ti.dst ?? ti.output ?? undefined;
  const from =
    ti.fromPath ?? ti.from_path ?? ti.src ?? ti.source ?? ti.input ?? undefined;

  if (typeof from === "string" && from) return { path: from, toPath: typeof to === "string" ? to : undefined };
  if (typeof p === "string" && p) return { path: p, toPath: typeof to === "string" ? to : undefined };
  return {};
}

async function loadSdk() {
  return await import("@anthropic-ai/claude-agent-sdk");
}

type ClaudeMessage = any;

const RUN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    result_text: { type: "string" },

    todos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", enum: ["add", "update", "complete"] },
          id: { type: "string" },
          text: { type: "string" },
          status: { type: "string" },
        },
        required: ["op", "id"],
      },
    },

    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          contentRef: { type: "string" },
          mime: { type: "string" },
          size: { type: "number" },
          sha256: { type: "string" },
          action: { type: "string", enum: ["created", "updated", "deleted", "unknown"] },
          path: { type: "string" },
        },
        required: ["name", "contentRef"],
      },
    },

    next_actions: {
      type: "array",
      items: { type: "string" },
    },

    errors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
  required: ["result_text"],
} as const;

function nowIso() {
  return new Date().toISOString();
}

function parseEventLineToAgentEvent(line: string): AgentEvent | null {
  const s = line.trim();
  if (!s.startsWith("@event")) return null;

  const rest = s.replace(/^@event\s+/, "");
  if (!rest) return null;

  const parts = rest.split(/\s+/);
  const type = parts[0];
  const sub = parts.length > 1 ? parts[1] : undefined;

  const payloadStr = rest.slice(type.length).trim();
  const payloadAfterSubtype =
    sub && payloadStr.startsWith(sub) ? payloadStr.slice(sub.length).trim() : payloadStr;

  const tryParseJson = (v: string) => {
    const t = v.trim();
    if (!t) return undefined;
    if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  };

  if (type === "todo") {
    const json = tryParseJson(payloadAfterSubtype);
    if (json && typeof json === "object") return { type: "todo", ...(json as any) } as any;

    const op = sub ?? "add";
    const text = payloadAfterSubtype;
    if (text) return { type: "todo", op, text } as any;
    return { type: "todo", op } as any;
  }

  if (type === "step") {
    const status = sub ?? "started";
    const json = tryParseJson(payloadAfterSubtype);
    if (json && typeof json === "object") return { type: "step", status, ...(json as any) } as any;
    const detail = payloadAfterSubtype;
    return { type: "step", status, detail } as any;
  }

  if (type === "log") {
    const level = sub ?? "info";
    const json = tryParseJson(payloadAfterSubtype);
    if (json && typeof json === "object") return { type: "log", level, ...(json as any) } as any;
    const msg = payloadAfterSubtype;
    return { type: "log", level, message: msg || "log" } as any;
  }

  if (type === "artifact") {
    const json = tryParseJson(payloadAfterSubtype);
    if (json && typeof json === "object") return { type: "artifact", ...(json as any) } as any;
    const text = payloadAfterSubtype;
    return { type: "artifact", title: text || "artifact" } as any;
  }

  if (type === "result" || type === "result_text") {
    const json = tryParseJson(payloadAfterSubtype);
    if (json && typeof json === "object") return { type: "result_text", ...(json as any) } as any;
    const text = payloadAfterSubtype;
    return { type: "result_text", text: text || "" } as any;
  }

  return { type: "log", level: "info", message: "unknown_event", data: { raw: s } } as any;
}

function ingestEventTextChunk(args: { chunk: string; carry: string; emit: (ev: AgentEvent) => void }): string {
  const { chunk, emit } = args;
  let buf = (args.carry || "") + (chunk || "");
  buf = buf.replace(/\r\n/g, "\n");

  const lines = buf.split("\n");
  const tail = lines.pop() ?? "";

  for (const line of lines) {
    const ev = parseEventLineToAgentEvent(line);
    if (ev) emit(ev);
  }

  return tail;
}

function mapClaudeMessageToTurns(msg: ClaudeMessage): SessionTurnResult[] {
  const out: SessionTurnResult[] = [];
  const sid = msg?.session_id ?? msg?.sessionId ?? msg?.data?.session_id ?? msg?.data?.sessionId;

  if (msg?.type === "system" && msg?.subtype === "init") {
    out.push({
      sessionId: sid,
      event: {
        type: "log",
        level: "info",
        message: "mcp_init",
        data: { mcp_servers: msg?.mcp_servers ?? msg?.data?.mcp_servers ?? null },
      } as any,
    });
    return out;
  }

  if (msg?.type === "assistant") {
    const text =
      msg?.content?.map?.((c: any) => c?.text).filter(Boolean).join("") ??
      msg?.text ??
      "";

    if (text) out.push({ sessionId: sid, text });
    if (Array.isArray(msg?.content)) {
      for (const block of msg.content) {
        if (block?.type === "tool_use" && typeof block?.name === "string" && block.name.startsWith("mcp__")) {
          out.push({
            sessionId: sid,
            event: { type: "log", level: "info", message: "mcp_tool_use", data: { name: block.name } } as any,
          });
        }
      }
    }

    const usage = msg?.usage
      ? {
          tokensIn: msg.usage?.input_tokens ?? msg.usage?.inputTokens,
          tokensOut: msg.usage?.output_tokens ?? msg.usage?.outputTokens,
          costCredits: undefined,
        }
      : undefined;

    if (usage?.tokensIn || usage?.tokensOut) out.push({ sessionId: sid, usage });
  }

  if (msg?.type === "result") {
    const text = msg?.output_text ?? msg?.text ?? "";
    if (text) out.push({ sessionId: sid, text });
  }

  return out;
}

function filterByAllowlist(tools: any[], allow?: string[]) {
  const entries = (allow ?? []).filter(Boolean);

  if (entries.includes("*")) return tools;

  const s = new Set(entries);
  if (!s.size) return [];
  return tools.filter((t) => t?.name && s.has(t.name));
}

type HookCallback = (input: any, toolUseID: string | null, ctx: { signal: AbortSignal }) => Promise<any>;

function mkHooksEmitter(params: {
  push: (t: SessionTurnResult) => void;
  files: WorkspaceFiles;
  toolTouches: Map<string, { tool: string; checkpointId?: string; path?: string; toPath?: string }>;
  workspaceDir: string;
}) {
  const { push, files, toolTouches, workspaceDir } = params;

  const emit = (event: AgentEvent, sessionId?: string, usage?: any) => {
    push({ sessionId, usage, event });
  };

  const sessionStart: HookCallback = async (input) => {
    const sid = input?.session_id ?? input?.sessionId;
    emit({ type: "session_started", sessionId: sid } as any, sid);
    return {};
  };

  const sessionEnd: HookCallback = async (input) => {
    const sid = input?.session_id ?? input?.sessionId;
    emit(
      {
        type: "log",
        level: "info",
        message: "session_end",
        data: { reason: input?.reason ?? "other", at: nowIso() },
      } as any,
      sid
    );
    return {};
  };

  const notification: HookCallback = async (input) => {
    const sid = input?.session_id ?? input?.sessionId;
    emit(
      {
        type: "log",
        level: "info",
        message: input?.message ?? "notification",
        data: { notification_type: input?.notification_type, title: input?.title },
      } as any,
      sid
    );
    return {};
  };

  const preToolUse: HookCallback = async (input, toolUseID) => {
    const sid = input?.session_id ?? input?.sessionId;
    const tool = input?.tool_name ?? input?.toolName ?? "unknown";
    const { path: p, toPath } = tryGetToolPaths(input);

    emit(
      {
        type: "step",
        status: "started",
        name: `tool:${tool}`,
        detail: `tool_use_id=${toolUseID ?? ""}`,
        data: { tool, toolUseID, path: p, toPath },
      } as any,
      sid
    );
    emit({ type: "log", level: "info", message: "tool_access", data: { tool, toolUseID, path: p, toPath } } as any, sid);

    if (toolUseID && isMutatingTool(tool) && p) {
      const checkpointId = await files.createCheckpoint([p], `tool:${tool}`);
      toolTouches.set(toolUseID, { tool, checkpointId, path: p, toPath });
    } else if (toolUseID) {
      toolTouches.set(toolUseID, { tool, path: p, toPath });
    }

    return {};
  };

  const postToolUse: HookCallback = async (input, toolUseID) => {
    const sid = input?.session_id ?? input?.sessionId;
    const tool = input?.tool_name ?? input?.toolName ?? "unknown";
    const { path: p, toPath } = tryGetToolPaths(input);

    emit(
      {
        type: "step",
        status: "completed",
        name: `tool:${tool}`,
        detail: `tool_use_id=${toolUseID ?? ""}`,
        data: { tool, toolUseID, path: p, toPath },
      } as any,
      sid
    );

    const touch = toolUseID ? toolTouches.get(toolUseID) : undefined;
    const fileOp = toolToFileOp(tool);

    if (fileOp && p) {
      const abs = path.resolve(workspaceDir, p);
      const after = await statFileSafe(abs);

      const beforeRef =
        touch?.checkpointId ? await files.getCheckpointContentRef(touch.checkpointId, p) : null;

      const afterPut =
        toolUseID ? await files.putFileVersion(toolUseID, "after", p) : null;

      emit(
        {
          type: "file",
          op: fileOp as any,
          path: p,
          toPath,
          bytesAfter: after?.bytes ?? null,
          shaAfter: after?.sha ?? null,
          contentRefBefore: beforeRef?.contentRef ?? null,
          contentRefAfter: afterPut?.contentRef ?? null,
          mime: afterPut?.mime ?? null,
          data: {
            tool,
            toolUseID,
            checkpointId: touch?.checkpointId ?? null,
            tool_input: input?.tool_input ?? input?.toolInput,
          },
        } as any,
        sid
      );
    }

    return {};
  };

  const postToolUseFailure: HookCallback = async (input, toolUseID) => {
    const sid = input?.session_id ?? input?.sessionId;
    const tool = input?.tool_name ?? input?.toolName ?? "unknown";
    const { path: p, toPath } = tryGetToolPaths(input);

    emit(
      {
        type: "step",
        status: "failed",
        name: `tool:${tool}`,
        detail: `tool_use_id=${toolUseID ?? ""}`,
        data: { tool, toolUseID, path: p, toPath },
      } as any,
      sid
    );
    emit(
      {
        type: "log",
        level: "error",
        message: "tool_failed",
        data: { tool, toolUseID, error: input?.error ?? input?.message ?? input?.reason ?? "unknown" },
      } as any,
      sid
    );

    return {};
  };

  return {
    SessionStart: [{ hooks: [sessionStart] }],
    SessionEnd: [{ hooks: [sessionEnd] }],
    Notification: [{ hooks: [notification] }],
    PreToolUse: [{ hooks: [preToolUse] }],
    PostToolUse: [{ hooks: [postToolUse] }],
    PostToolUseFailure: [{ hooks: [postToolUseFailure] }],
  };
}

function emitStructuredOutput(args: { structured: any; push: (t: SessionTurnResult) => void; sessionId?: string }) {
  const { structured, push, sessionId } = args;
  if (!structured || typeof structured !== "object") return;

  const todos = Array.isArray(structured.todos) ? structured.todos : [];
  for (const t of todos) {
    if (!t || typeof t !== "object") continue;
    if (!t.op || !t.id) continue;
    push({ sessionId, event: { type: "todo", op: t.op, id: t.id, text: t.text, status: t.status } as any });
  }

  const artifacts = Array.isArray(structured.artifacts) ? structured.artifacts : [];
  for (const a of artifacts) {
    if (!a || typeof a !== "object") continue;
    if (!a.name || !a.contentRef) continue;
    push({
      sessionId,
      event: {
        type: "artifact",
        name: a.name,
        contentRef: a.contentRef,
        mime: a.mime,
        size: a.size,
        sha256: a.sha256,
        action: a.action,
        path: a.path,
      } as any,
    });
  }

  const next = Array.isArray(structured.next_actions) ? structured.next_actions : [];
  if (next.length) {
    push({ sessionId, event: { type: "log", level: "info", message: "next_actions", data: { next_actions: next } } as any });
  }

  const errs = Array.isArray(structured.errors) ? structured.errors : [];
  for (const e of errs) {
    if (!e || typeof e !== "object") continue;
    push({ sessionId, event: { type: "log", level: "error", message: e.message ?? "error", data: { code: e.code } } as any });
  }

  if (typeof structured.result_text === "string") {
    push({ sessionId, event: { type: "result_text", text: structured.result_text } as any });
  }
}

type PromptMsg =
  | { type: "user"; message: { role: "user"; content: string } }
  | { type: "assistant"; message: { role: "assistant"; content: string } };

async function* promptStreamFromText(text: string): AsyncGenerator<PromptMsg> {
  yield { type: "user", message: { role: "user", content: text } };
}

class ClaudeSessionHandle implements SessionHandle {
  private iter: AsyncGenerator<SessionTurnResult> | null = null;
  private userText: string | null = null;

  constructor(
    private readonly args: SessionCreateArgs & { resumeSessionId?: string; enableToolSearch?: string },
    private readonly model?: string
  ) {}

  async send(userText: string): Promise<void> {
    this.userText = userText;
  }

  stream(): AsyncGenerator<SessionTurnResult> {
    if (this.iter) return this.iter;

    const self = this;

    this.iter = (async function* () {
      const sdk = await loadSdk();
      const { query } = sdk as any;

      const queue: SessionTurnResult[] = [];
      let lastSessionId: string | undefined;

      const runId = self.args.runId ?? "unknown_run";
      const workspaceDir = self.args.workspaceDir ?? process.cwd();

      const eventBuffer =
        self.args.programHash && self.args.principalId
          ? new EventBuffer(
              {
                v: 1,
                runId,
                programHash: self.args.programHash,
                principalId: self.args.principalId,
                agentName: self.args.agentName!,
                sessionId: undefined,
              },
              self.args.eventBufferOptions
            )
          : null;
      eventBuffer?.start();

      const push = (t: SessionTurnResult) => {
        queue.push(t);

        if (eventBuffer && (t.event || t.usage)) {
          eventBuffer.enqueue(
            t.event ?? undefined,
            t.usage ?? undefined,
            {
              agentName: self.args.agentName ?? undefined,
              sessionId: t.sessionId ?? lastSessionId ?? undefined,
            }
          );
        }
      };

      const files = new WorkspaceFiles({
        runId,
        workspaceDir,
        principalId: self.args.principalId,
        agentName: self.args.agentName,
        emit: (ev) => push({ event: ev, sessionId: lastSessionId }),
        versioning: true,
        maxFileBytes: self.args.maxFileBytes ?? null,
        maxWorkspaceBytes: self.args.maxWorkspaceBytes ?? null,
      });

      const toolTouches = new Map<string, { tool: string; checkpointId?: string; path?: string; toPath?: string }>();
      const hooks = mkHooksEmitter({ push, files, toolTouches, workspaceDir });

      const prompt = self.userText ?? "";

      const toolHandler = self.args.toolHandler;
      const allow = self.args._effectiveAllow ?? [];

      const customTools = (self.args.tools ?? []).map((t: any) =>
        t?.type ? t : { name: t.name, description: t.description ?? "", input_schema: t.input_schema ?? { type: "object", properties: {} } }
      );
      
      const sdkTools = filterByAllowlist([...NATIVE_TOOLS, ...customTools], allow);

      const options: any = {
        model: self.model ?? self.args.model,
        ...(self.args.resumeSessionId ? { resume: self.args.resumeSessionId } : {}),
        ...(self.args.system ? { system: self.args.system } : {}),
        hooks,
        outputFormat: { type: "json_schema", schema: RUN_OUTPUT_SCHEMA },
        tools: sdkTools,
      
        // ✅ MCP passthrough (already derived in runtime)
        ...(self.args.mcpServers ? { mcpServers: self.args.mcpServers } : {}),
        ...(self.args.allowedTools ? { allowedTools: self.args.allowedTools } : {}),
        ...(self.args.permissionMode ? { permissionMode: self.args.permissionMode } : {}),
      
        // ✅ env passed once; includes ENABLE_TOOL_SEARCH if you want it
        ...(self.args.env ? { env: self.args.env } : {}),
      
        ...(toolHandler
          ? {
              toolHandler: async (call: any) => {
                const name = call?.name ?? call?.tool_name ?? call?.toolName;
                const input = call?.input ?? call?.tool_input ?? call?.toolInput ?? {};
                const toolUseId = call?.tool_use_id ?? call?.toolUseId ?? call?.id ?? undefined;
      
                const r = await toolHandler({ name, input, toolUseId });
                if ((r as any)?.ok) return (r as any).output;
      
                const err = (r as any)?.error ?? { code: "tool_failed", message: "tool_failed" };
                throw Object.assign(new Error(err.message ?? "tool_failed"), { code: err.code, data: err.data });
              },
            }
          : {}),
      };
      
      const resp = query({ prompt: promptStreamFromText(prompt), options });

      let carry = "";
      let announced = false;

      const emitEvent = (ev: AgentEvent) => {
        push({ sessionId: lastSessionId, event: ev });
      };

      try {
        for await (const msg of resp as AsyncIterable<any>) {
          while (queue.length) yield queue.shift()!;

          if (msg?.type === "result") {
            const sid = msg?.session_id ?? msg?.sessionId ?? lastSessionId;
            if (sid) lastSessionId = sid;

            if (msg?.subtype === "error_max_structured_output_retries") {
              push({
                sessionId: lastSessionId,
                event: { type: "log", level: "error", message: "structured_output_failed", data: { subtype: msg.subtype } } as any,
              });
            } else if (msg?.structured_output) {
              emitStructuredOutput({ structured: msg.structured_output, push, sessionId: lastSessionId });
            }
          }

          const turns = mapClaudeMessageToTurns(msg);

          for (const t of turns) {
            if (t.sessionId) lastSessionId = t.sessionId;

            if (!announced && lastSessionId) {
              announced = true;
              push({
                sessionId: lastSessionId,
                event: (self.args.resumeSessionId
                  ? { type: "session_resumed", sessionId: lastSessionId }
                  : { type: "session_started", sessionId: lastSessionId }) as any,
              });
            }

            if (t.text) {
              carry = ingestEventTextChunk({
                chunk: t.text,
                carry,
                emit: (ev) => emitEvent(ev),
              });
            }

            yield t;
          }
        }

        const tailEv = parseEventLineToAgentEvent(carry);
        if (tailEv) push({ sessionId: lastSessionId, event: tailEv });

        while (queue.length) yield queue.shift()!;
      } finally {
        await eventBuffer?.flushAllAndStop().catch(() => {});
      }
    })();

    return this.iter;
  }

  close(): void {}
}

export function makeClaudeAdapter(): SessionAdapter {
  return {
    async createSession(args: SessionCreateArgs): Promise<SessionHandle> {
      return new ClaudeSessionHandle(args, args.model);
    },

    async resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle> {
      return new ClaudeSessionHandle({ ...args, resumeSessionId: args.sessionId }, args.model);
    },
  };
}