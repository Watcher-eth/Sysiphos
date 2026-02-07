// runner/src/prose/adapters/claudeV2.ts
import type {
  AgentEvent,
  SessionAdapter,
  SessionCreateArgs,
  SessionHandle,
  SessionTurnResult,
  ToolHandler,
  ClaudeToolDef,
} from "../sessionAdapter";

/**
 * This adapter implements *real* Anthropic tool calling (tool_use -> tool_result loop)
 * using the Messages API via fetch. It does NOT rely on claude-agent-sdk for tools.
 *
 * You can still keep your claude-agent-sdk adapter around, but this one is the Phase-1
 * "real tools" path.
 */

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any };

type AnthropicMessageResponse = {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type AnthropicErrorResponse = { error?: { type?: string; message?: string } };

function mustAnthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY missing");
  return k;
}

function nowIso() {
  return new Date().toISOString();
}

function asTextBlocks(content: AnthropicContentBlock[]) {
  return content.filter((b): b is { type: "text"; text: string } => b?.type === "text" && typeof (b as any).text === "string");
}

function asToolUses(content: AnthropicContentBlock[]) {
  return content.filter((b): b is { type: "tool_use"; id: string; name: string; input: any } => b?.type === "tool_use");
}

function defaultTools(): ClaudeToolDef[] {
  // Minimal Phase-1 list. You can override via SessionCreateArgs.tools.
  return [
    {
      name: "tools.search",
      description: "Search available tools in the control plane tool catalog.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "number" } },
        required: ["query"],
      },
    },
    {
      name: "tools.request",
      description: "Request additional tool/capability grants for the current run.",
      input_schema: {
        type: "object",
        properties: {
          grants: { type: "array" },
          reason: { type: "string" },
        },
        required: ["grants"],
      },
    },
    {
      name: "files.list",
      description: "List allowed files for this run.",
      input_schema: { type: "object", properties: { prefix: { type: "string" } } },
    },
    {
      name: "files.get",
      description: "Read a text file (must be allowed in the manifest).",
      input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    {
      name: "files.put",
      description: "Write a text file (must be rw in the manifest).",
      input_schema: { type: "object", properties: { path: { type: "string" }, text: { type: "string" } }, required: ["path", "text"] },
    },
    {
      name: "http.fetch",
      description: "Fetch a URL (requires net.egress + domain allowlist).",
      input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  ];
}

type Msg = { role: "user" | "assistant"; content: any };

async function anthropicCall(args: {
  model: string;
  system?: string;
  messages: Msg[];
  tools: ClaudeToolDef[];
  toolChoice?: "auto" | "any" | { type: "tool"; name: string };
  maxTokens?: number;
  idempotencyKey?: string | null;
}): Promise<AnthropicMessageResponse> {
  const key = mustAnthropicKey();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens ?? 1024,
      ...(args.system ? { system: args.system } : {}),
      messages: args.messages,
      tools: args.tools,
      tool_choice: args.toolChoice ?? "auto",
    }),
  });

  if (!res.ok) {
    const t = (await res.text().catch(() => "")) || "";
    let parsed: AnthropicErrorResponse | null = null;
    try {
      parsed = JSON.parse(t);
    } catch {}
    const msg = parsed?.error?.message || t || `anthropic_http_${res.status}`;
    throw new Error(msg);
  }

  return (await res.json()) as AnthropicMessageResponse;
}

function mkSystem(args: SessionCreateArgs) {
  const sysParts: string[] = [];
  if (args.system) sysParts.push(args.system);
  if (args.memoryText) sysParts.push(`\n\n# memory\n${args.memoryText}`);
  return sysParts.join("\n\n");
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
      const queue: SessionTurnResult[] = [];
      const push = (t: SessionTurnResult) => queue.push(t);

      const toolHandler: ToolHandler | undefined = self.args.toolHandler;
      const tools = (self.args.tools && self.args.tools.length ? self.args.tools : defaultTools()) as ClaudeToolDef[];

      const model = self.model ?? self.args.model ?? "claude-3-5-sonnet-latest";
      const system = mkSystem(self.args);
      const prompt = self.userText ?? "";

      let lastSessionId: string | undefined = self.args.resumeSessionId ?? undefined;
      let announced = false;

      const emit = (ev: AgentEvent) => {
        push({ sessionId: lastSessionId, event: ev });
      };

      // Build a conversation transcript for the messages API
      const messages: Msg[] = [];
      messages.push({ role: "user", content: prompt });

      // Tool loop: keep calling the model until it stops asking for tools
      for (let turn = 0; turn < 50; turn++) {
        const resp = await anthropicCall({
          model,
          system,
          messages,
          tools,
          toolChoice: "auto",
          maxTokens: 2048,
          idempotencyKey: self.args.idempotencyKey ?? null,
        });

        lastSessionId = resp.id || lastSessionId;

        if (!announced && lastSessionId) {
          announced = true;
          emit(
            (self.args.resumeSessionId
              ? { type: "session_resumed", sessionId: String(lastSessionId) }
              : { type: "session_started", sessionId: String(lastSessionId) }) as any
          );
        }

        // Emit usage
        if (resp.usage?.input_tokens || resp.usage?.output_tokens) {
          push({
            sessionId: lastSessionId,
            usage: { tokensIn: resp.usage?.input_tokens, tokensOut: resp.usage?.output_tokens },
          });
        }

        // Emit raw
        push({ sessionId: lastSessionId, event: { type: "raw", provider: "claude", payload: resp } as any });

        // Emit assistant text (and event-line parsing happens in runtime if you still do that)
        const text = asTextBlocks(resp.content).map((b) => b.text).join("");
        if (text) push({ sessionId: lastSessionId, text });

        // Handle tool_use blocks
        const toolUses = asToolUses(resp.content);

        if (!toolUses.length) {
          // Done
          break;
        }

        if (!toolHandler) {
          // No handler -> fail fast and provide tool_result error so model can continue / gracefully finish
          for (const tu of toolUses) {
            emit({
              type: "log",
              level: "error",
              message: "tool_handler_missing",
              data: { tool: tu.name, toolUseId: tu.id },
            } as any);

            messages.push({
              role: "assistant",
              content: resp.content,
            });

            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: JSON.stringify({ code: "tool_handler_missing", message: "No toolHandler provided" }),
                },
              ],
            });
          }
          continue;
        }

        // Append assistant content first, then tool_results
        messages.push({ role: "assistant", content: resp.content });

        for (const tu of toolUses) {
          emit({ type: "step", status: "started", name: `tool:${tu.name}`, detail: `tool_use_id=${tu.id}`, data: { input: tu.input } } as any);

          const result = await toolHandler({ name: tu.name, input: tu.input, toolUseId: tu.id }).catch((e: any) => ({
            ok: false as const,
            error: { code: "tool_failed", message: String(e?.message ?? e) },
          }));

          if (result.ok) {
            emit({ type: "step", status: "completed", name: `tool:${tu.name}`, detail: `tool_use_id=${tu.id}` } as any);
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: false,
                  content: JSON.stringify(result.output),
                },
              ],
            });
          } else {
            emit({
              type: "step",
              status: "failed",
              name: `tool:${tu.name}`,
              detail: `tool_use_id=${tu.id}`,
              data: { error: result.error },
            } as any);
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: tu.id,
                  is_error: true,
                  content: JSON.stringify(result.error),
                },
              ],
            });
          }
        }

        while (queue.length) yield queue.shift()!;
      }

      emit({ type: "log", level: "info", message: "session_end", data: { at: nowIso() } } as any);

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