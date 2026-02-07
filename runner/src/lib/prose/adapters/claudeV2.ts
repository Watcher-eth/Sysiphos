// runner/src/prose/adapters/claudeV2.ts
import type {
    AgentEvent,
    SessionAdapter,
    SessionCreateArgs,
    SessionHandle,
    SessionTurnResult,
  } from "../sessionAdapter";
  
  // NOTE: keep imports dynamic so runner can boot without this dep in dev
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
  
            // optional (helps UI)
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
  
  /**
   * Fallback: parse "@event ..." lines out of assistant text.
   *
   * Supported shapes:
   *  1) @event <type> <json>
   *  2) @event <type> <subtype> <json>
   *  3) @event log info <free text>
   */
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
  
  /**
   * Streaming-safe parser: consumes full text chunks, emits events from complete lines,
   * returns remaining tail (incomplete last line).
   */
  function ingestEventTextChunk(args: {
    chunk: string;
    carry: string;
    emit: (ev: AgentEvent) => void;
  }): string {
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
  
  // Minimal mapper from SDK messages -> SessionTurnResult (text + usage only).
  function mapClaudeMessageToTurns(msg: ClaudeMessage): SessionTurnResult[] {
    const out: SessionTurnResult[] = [];
  
    const sid =
      msg?.session_id ??
      msg?.sessionId ??
      msg?.data?.session_id ??
      msg?.data?.sessionId;
  
    if (msg?.type === "assistant") {
      const text =
        msg?.content?.map?.((c: any) => c?.text).filter(Boolean).join("") ??
        msg?.text ??
        "";
  
      if (text) out.push({ sessionId: sid, text });
  
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
  
  type HookCallback = (
    input: any,
    toolUseID: string | null,
    ctx: { signal: AbortSignal }
  ) => Promise<any>;
  
  function tryGetToolPath(input: any): string | undefined {
    const ti = input?.tool_input ?? input?.toolInput;
    if (!ti || typeof ti !== "object") return undefined;
    return (
      ti.path ??
      ti.file_path ??
      ti.filePath ??
      ti.filename ??
      ti.file ??
      ti.target ??
      undefined
    );
  }
  
  function mkHooksEmitter(params: { push: (t: SessionTurnResult) => void }) {
    const { push } = params;
  
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
  
      emit(
        {
          type: "step",
          status: "started",
          name: `tool:${tool}`,
          detail: `tool_use_id=${toolUseID ?? ""}`,
          data: {
            tool,
            toolUseID,
            path: tryGetToolPath(input),
          },
        } as any,
        sid
      );
  
      // Optional: "integration used" breadcrumb
      emit(
        {
          type: "log",
          level: "info",
          message: "tool_access",
          data: { tool, toolUseID, path: tryGetToolPath(input) },
        } as any,
        sid
      );
  
      return {};
    };
  
    const postToolUse: HookCallback = async (input, toolUseID) => {
      const sid = input?.session_id ?? input?.sessionId;
      const tool = input?.tool_name ?? input?.toolName ?? "unknown";
      const path = tryGetToolPath(input);
  
      emit(
        {
          type: "step",
          status: "completed",
          name: `tool:${tool}`,
          detail: `tool_use_id=${toolUseID ?? ""}`,
          data: { tool, toolUseID, path },
        } as any,
        sid
      );
  
      // Best-effort: surface likely file mutations as explicit artifact events
      if (tool === "Write" || tool === "Edit" || tool === "Mkdir" || tool === "Rm") {
        const action =
          tool === "Write" ? "created" :
          tool === "Edit" ? "updated" :
          tool === "Mkdir" ? "created" :
          tool === "Rm" ? "deleted" :
          "unknown";
  
        emit(
          {
            type: "artifact",
            name: path ?? `via:${tool}`,
            contentRef: "",
            action,
            path,
            data: { tool, toolUseID, tool_input: input?.tool_input ?? input?.toolInput },
          } as any,
          sid
        );
      }
  
      return {};
    };
  
    const postToolUseFailure: HookCallback = async (input, toolUseID) => {
      const sid = input?.session_id ?? input?.sessionId;
      const tool = input?.tool_name ?? input?.toolName ?? "unknown";
  
      emit(
        {
          type: "step",
          status: "failed",
          name: `tool:${tool}`,
          detail: `tool_use_id=${toolUseID ?? ""}`,
          data: { tool, toolUseID, path: tryGetToolPath(input) },
        } as any,
        sid
      );
  
      emit(
        {
          type: "log",
          level: "error",
          message: "tool_failed",
          data: {
            tool,
            toolUseID,
            error: input?.error ?? input?.message ?? input?.reason ?? "unknown",
          },
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
  
  function emitStructuredOutput(args: {
    structured: any;
    push: (t: SessionTurnResult) => void;
    sessionId?: string;
  }) {
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
      push({
        sessionId,
        event: { type: "log", level: "info", message: "next_actions", data: { next_actions: next } } as any,
      });
    }
  
    const errs = Array.isArray(structured.errors) ? structured.errors : [];
    for (const e of errs) {
      if (!e || typeof e !== "object") continue;
      push({
        sessionId,
        event: { type: "log", level: "error", message: e.message ?? "error", data: { code: e.code } } as any,
      });
    }
  
    if (typeof structured.result_text === "string") {
      push({ sessionId, event: { type: "result_text", text: structured.result_text } as any });
    }
  }
  
  class ClaudeSessionHandle implements SessionHandle {
    private iter: AsyncGenerator<SessionTurnResult> | null = null;
    private userText: string | null = null;
  
    constructor(
      private readonly args: SessionCreateArgs & { resumeSessionId?: string },
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
        const push = (t: SessionTurnResult) => queue.push(t);
  
        const hooks = mkHooksEmitter({ push });
  
        const prompt = self.userText ?? "";
  
        const options: any = {
          model: self.model ?? self.args.model,
          ...(self.args.resumeSessionId ? { resume: self.args.resumeSessionId } : {}),
          ...(self.args.system ? { system: self.args.system } : {}),
          hooks,
          outputFormat: { type: "json_schema", schema: RUN_OUTPUT_SCHEMA },
        };
  
        const resp = query({ prompt, options });
  
        let carry = "";
        let lastSessionId: string | undefined;
        let announced = false;
  
        const emitEvent = (ev: AgentEvent) => {
          push({ sessionId: lastSessionId, event: ev });
        };
  
        for await (const msg of resp as AsyncIterable<any>) {
          while (queue.length) yield queue.shift()!;
  
          // structured outputs (final contract)
          if (msg?.type === "result") {
            const sid = msg?.session_id ?? msg?.sessionId ?? lastSessionId;
            if (sid) lastSessionId = sid;
  
            if (msg?.subtype === "error_max_structured_output_retries") {
              push({
                sessionId: lastSessionId,
                event: {
                  type: "log",
                  level: "error",
                  message: "structured_output_failed",
                  data: { subtype: msg.subtype },
                } as any,
              });
            } else if (msg?.structured_output) {
              emitStructuredOutput({
                structured: msg.structured_output,
                push,
                sessionId: lastSessionId,
              });
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