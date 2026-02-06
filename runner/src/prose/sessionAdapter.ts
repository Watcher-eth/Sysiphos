// runner/src/prose/sessionAdapter.ts
import type { PromptParts } from "./prompts";

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;
};

export type SessionTurnResult = {
  text: string;
  sessionId?: string;
  usage?: { tokensIn?: number; tokensOut?: number; costCredits?: number };
};

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export interface SessionAdapter {
  createSession(args: SessionCreateArgs): Promise<SessionHandle>;
  resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle>;
}

type EnvAdapter = "mock" | "anthropic_v2";

// Use env defaults so runner works without config.
function defaultModel() {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";
}

function detectAdapter(): EnvAdapter {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic_v2";
  return "mock";
}

export async function makeAdapterFromEnv(): Promise<SessionAdapter> {
  const kind = detectAdapter();
  if (kind === "anthropic_v2") {
    return makeAnthropicV2Adapter();
  }
  return makeMockAdapter();
}

export function makeMockAdapter(): SessionAdapter {
  return {
    async createSession(_args) {
      let lastUser = "";
      return {
        async send(userText) {
          lastUser = userText;
        },
        async *stream() {
          yield {
            sessionId: "mock_session",
            text:
              `Mock assistant response\n\n` +
              `<result>\n` +
              `I received:\n${lastUser}\n` +
              `</result>\n`,
            usage: { costCredits: 1 },
          };
        },
        close() {},
      };
    },

    async resumeSession(args) {
      // same mock behavior, memoryText is available in args.memoryText
      return this.createSession(args);
    },
  };
}

async function makeAnthropicV2Adapter(): Promise<SessionAdapter> {
  // Lazy import so local dev doesn’t require the package at runtime.
  const sdk = await import("@anthropic-ai/claude-agent-sdk");

  const create = sdk.unstable_v2_createSession as (opts: any) => any;
  const resume = sdk.unstable_v2_resumeSession as (sessionId: string, opts: any) => any;

  function toUsage(msg: any): SessionTurnResult["usage"] {
    const u = msg?.usage ?? msg?.message?.usage ?? null;
    if (!u) return undefined;
    return {
      tokensIn: u.input_tokens ?? u.tokensIn ?? undefined,
      tokensOut: u.output_tokens ?? u.tokensOut ?? undefined,
      costCredits: u.costCredits ?? undefined,
    };
  }

  function extractText(msg: any): string {
    // V2 demo shape: msg.type === 'assistant' and msg.message.content blocks
    const blocks = msg?.message?.content;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b) => b?.type === "text")
        .map((b) => String(b?.text ?? ""))
        .join("");
    }
    // fallback
    if (typeof msg?.text === "string") return msg.text;
    if (typeof msg?.result === "string") return msg.result;
    return "";
  }

  return {
    async createSession(args) {
      const session = create({
        model: args.model ?? defaultModel(),
        system: args.system,
      });

      let buffered: any[] = [];
      let closed = false;

      return {
        async send(userText) {
          if (closed) throw new Error("session_closed");
          await session.send(userText);
          buffered = [];
        },

        async *stream() {
          if (closed) return;

          for await (const msg of session.stream()) {
            buffered.push(msg);

            // Only yield assistant text (like the V2 docs recommend)
            if (msg?.type === "assistant") {
              const text = extractText(msg);
              const sessionId = msg?.session_id ?? msg?.sessionId ?? undefined;

              yield {
                sessionId,
                text,
                usage: toUsage(msg),
              };
            }
          }
        },

        close() {
          if (closed) return;
          closed = true;
          try {
            session.close();
          } catch {
            // ignore
          }
        },
      };
    },

    async resumeSession(args) {
      const session = resume(args.sessionId, {
        model: args.model ?? defaultModel(),
        system: args.system,
      });

      let closed = false;

      return {
        async send(userText) {
          if (closed) throw new Error("session_closed");
          await session.send(userText);
        },

        async *stream() {
          if (closed) return;

          for await (const msg of session.stream()) {
            if (msg?.type === "assistant") {
              const text = extractText(msg);
              const sessionId = msg?.session_id ?? msg?.sessionId ?? args.sessionId;

              yield {
                sessionId,
                text,
                usage: toUsage(msg),
              };
            }
          }
        },

        close() {
          if (closed) return;
          closed = true;
          try {
            session.close();
          } catch {
            // ignore
          }
        },
      };
    },
  };
}