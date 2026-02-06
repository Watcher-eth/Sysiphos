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
  
  function nowIso() {
    return new Date().toISOString();
  }
  
  /**
   * Fallback: parse "@event ..." lines out of assistant text.
   *
   * Supported shapes:
   *  1) @event <type> <json>
   *     e.g. @event todo {"op":"add","id":"t1","text":"Do X"}
   *
   *  2) @event <type> <subtype> <json>
   *     e.g. @event step started {"name":"tool:Write","detail":"..."}
   *
   *  3) @event log info <free text>
   *     e.g. @event log info something happened
   *
   * Anything unrecognized becomes a log event (level=info) with raw payload.
   */
  function parseEventLineToAgentEvent(line: string): AgentEvent | null {
    const s = line.trim();
    if (!s.startsWith("@event")) return null;
  
    const rest = s.replace(/^@event\s+/, "");
    if (!rest) return null;
  
    const parts = rest.split(/\s+/);
    const type = parts[0];
    const sub = parts.length > 1 ? parts[1] : undefined;
  
    const payloadStr = rest.slice(type.length).trim(); // includes subtype + payload
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
  
    // ---- TODO ----
    if (type === "todo") {
      const json = tryParseJson(payloadAfterSubtype);
      if (json && typeof json === "object") {
        // expect {op,id,text,status?,order?,description?}
        return { type: "todo", ...(json as any) } as any;
      }
  
      // allow: "@event todo add some text..."
      const op = sub ?? "add";
      const text = payloadAfterSubtype;
      if (text) return { type: "todo", op, text } as any;
      return { type: "todo", op } as any;
    }
  
    // ---- STEP ----
    if (type === "step") {
      const status = sub ?? "started";
      const json = tryParseJson(payloadAfterSubtype);
      if (json && typeof json === "object") {
        return { type: "step", status, ...(json as any) } as any;
      }
      // allow: "@event step started name=... detail=..."
      const detail = payloadAfterSubtype;
      return { type: "step", status, detail } as any;
    }
  
    // ---- LOG ----
    if (type === "log") {
      const level = sub ?? "info";
      const json = tryParseJson(payloadAfterSubtype);
      if (json && typeof json === "object") {
        return { type: "log", level, ...(json as any) } as any;
      }
      const msg = payloadAfterSubtype;
      return { type: "log", level, message: msg || "log" } as any;
    }
  
    // ---- ARTIFACT ----
    if (type === "artifact") {
      const json = tryParseJson(payloadAfterSubtype);
      if (json && typeof json === "object") {
        return { type: "artifact", ...(json as any) } as any;
      }
      const text = payloadAfterSubtype;
      return { type: "artifact", title: text || "artifact" } as any;
    }
  
    // ---- RESULT ----
    if (type === "result" || type === "result_text") {
      const json = tryParseJson(payloadAfterSubtype);
      if (json && typeof json === "object") {
        return { type: "result_text", ...(json as any) } as any;
      }
      const text = payloadAfterSubtype;
      return { type: "result_text", text: text || "" } as any;
    }
  
    // unknown → log
    return {
      type: "log",
      level: "info",
      message: "unknown_event",
      data: { raw: s },
    } as any;
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
    // normalize newlines; keep \n splitting predictable
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
  // Hook events + @event parsing fill in SessionTurnResult.event.
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
        } as any,
        sid
      );
      return {};
    };
  
    const postToolUse: HookCallback = async (input, toolUseID) => {
      const sid = input?.session_id ?? input?.sessionId;
      const tool = input?.tool_name ?? input?.toolName ?? "unknown";
      emit(
        {
          type: "step",
          status: "completed",
          name: `tool:${tool}`,
          detail: `tool_use_id=${toolUseID ?? ""}`,
        } as any,
        sid
      );
  
      // Best-effort: surface likely file modifications as artifacts/logs.
      if (tool === "Write" || tool === "Edit") {
        emit(
          {
            type: "log",
            level: "info",
            message: `file_modified_via_${tool}`,
            data: { toolUseID, tool_input: input?.tool_input ?? input?.toolInput },
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
      // lifecycle
      SessionStart: [{ hooks: [sessionStart] }],
      SessionEnd: [{ hooks: [sessionEnd] }],
      Notification: [{ hooks: [notification] }],
  
      // tool pipeline
      PreToolUse: [{ hooks: [preToolUse] }],
      PostToolUse: [{ hooks: [postToolUse] }],
      PostToolUseFailure: [{ hooks: [postToolUseFailure] }],
    };
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
        };
  
        const resp = query({ prompt, options });
  
        // @event parsing state (streaming-safe)
        let carry = "";
        let lastSessionId: string | undefined;
        let announced = false;
  
        const emitEvent = (ev: AgentEvent) => {
          push({ sessionId: lastSessionId, event: ev });
        };
  
        for await (const msg of resp as AsyncIterable<any>) {
          // drain hook-emitted queue first
          while (queue.length) yield queue.shift()!;
  
          const turns = mapClaudeMessageToTurns(msg);
          for (const t of turns) {
            if (t.sessionId) lastSessionId = t.sessionId;
  
            // announce resumed/started once we actually know a sessionId (hooks sometimes fire first, sometimes not)
            if (!announced && lastSessionId) {
              announced = true;
              push({
                sessionId: lastSessionId,
                event: (self.args.resumeSessionId
                  ? { type: "session_resumed", sessionId: lastSessionId }
                  : { type: "session_started", sessionId: lastSessionId }) as any,
              });
            }
  
            // fallback parse @event lines from assistant text
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
  
        // final drain of any remaining @event in tail (only if it’s a complete single-line event)
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
  
      async resumeSession(
        args: SessionCreateArgs & { sessionId: string }
      ): Promise<SessionHandle> {
        return new ClaudeSessionHandle(
          { ...args, resumeSessionId: args.sessionId },
          args.model
        );
      },
    };
  }