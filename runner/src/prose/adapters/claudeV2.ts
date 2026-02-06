import type { SessionAdapter, SessionCreateArgs, SessionHandle, SessionTurnResult } from "../sessionAdapter";

type ClaudeV2CreateSession = (opts: any) => any;
type ClaudeV2ResumeSession = (sessionId: string, opts: any) => any;

type ClaudeV2SDK = {
  unstable_v2_createSession: ClaudeV2CreateSession;
  unstable_v2_resumeSession: ClaudeV2ResumeSession;
};

async function loadClaudeSdk(): Promise<ClaudeV2SDK> {
  // Keep this isolated so the rest of your codebase doesn’t hard-bind to the package at build time if you don’t want it.
  const mod = (await import("@anthropic-ai/claude-agent-sdk")) as any;

  const create = mod?.unstable_v2_createSession;
  const resume = mod?.unstable_v2_resumeSession;

  if (typeof create !== "function" || typeof resume !== "function") {
    throw new Error("claude_sdk_missing_v2_api");
  }

  return {
    unstable_v2_createSession: create,
    unstable_v2_resumeSession: resume,
  };
}

function extractAssistantText(msg: any): string | null {
  // V2 docs: msg.type === 'assistant' and msg.message.content is array of blocks {type:'text', text:string}
  if (!msg || msg.type !== "assistant") return null;

  const blocks = msg?.message?.content;
  if (!Array.isArray(blocks)) return null;

  const text = blocks
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("");

  return text.length ? text : null;
}

function extractSessionId(msg: any): string | undefined {
  const sid = msg?.session_id;
  return typeof sid === "string" && sid.length ? sid : undefined;
}

function extractUsage(msg: any): SessionTurnResult["usage"] | undefined {
  // The SDK message shape can evolve; keep this permissive.
  // Common patterns might include msg.usage or msg.message.usage; we’ll check a few likely spots.
  const u =
    msg?.usage ??
    msg?.message?.usage ??
    msg?.message?.metadata?.usage ??
    msg?.metadata?.usage;

  if (!u || typeof u !== "object") return undefined;

  const tokensIn = typeof u.tokensIn === "number" ? u.tokensIn : typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const tokensOut = typeof u.tokensOut === "number" ? u.tokensOut : typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  const costCredits = typeof u.costCredits === "number" ? u.costCredits : undefined;

  if (tokensIn === undefined && tokensOut === undefined && costCredits === undefined) return undefined;
  return { tokensIn, tokensOut, costCredits };
}

type ClaudeAdapterOpts = {
  defaultModel: string;
};

/**
 * Claude Agent SDK V2 adapter:
 * - createSession/resumeSession
 * - send() then stream() cycle per turn (matches your runtime)
 * - converts SDKMessage stream -> SessionTurnResult stream
 */
export function makeClaudeV2Adapter(opts?: Partial<ClaudeAdapterOpts>): SessionAdapter {
  const defaultModel = opts?.defaultModel ?? process.env.CLAUDE_MODEL ?? "claude-opus-4-6";

  return {
    async createSession(args: SessionCreateArgs): Promise<SessionHandle> {
      const sdk = await loadClaudeSdk();

      const model = args.model ?? defaultModel;

      // V2 session object is (usually) a resource that can be closed; we forward close().
      const session = sdk.unstable_v2_createSession({
        model,
        // If the SDK supports other options (api key, base url), add them here later.
      });

      // Optional: if you want to “seed” system/memory into the first turn, you can
      // prepend them into the user message. For now, we keep the contract:
      // - args.system influences the prompt building upstream
      // - args.memoryText is passed to resumeSession, not createSession
      let closed = false;

      return {
        async send(userText: string) {
          if (closed) throw new Error("session_closed");
          await session.send(userText);
        },

        async *stream(): AsyncGenerator<SessionTurnResult> {
          if (closed) throw new Error("session_closed");

          for await (const msg of session.stream()) {
            const text = extractAssistantText(msg);
            if (!text) continue;

            yield {
              text,
              usage: extractUsage(msg),
              sessionId: extractSessionId(msg),
            };
          }
        },

        close() {
          if (closed) return;
          closed = true;
          try {
            session.close?.();
          } catch {
            // ignore
          }
        },
      };
    },

    async resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle> {
      const sdk = await loadClaudeSdk();

      const model = args.model ?? defaultModel;

      const session = sdk.unstable_v2_resumeSession(args.sessionId, {
        model,
      });

      let closed = false;

      // If you want persistent memory behavior that is NOT purely Claude’s session memory,
      // you can “re-hydrate” memoryText into the first send() after resume.
      // But your runtime already passes memoryText separately; safest pattern:
      // include it in the userText (upstream in renderSessionPrompt / runtime).
      // We keep adapter simple + predictable.

      return {
        async send(userText: string) {
          if (closed) throw new Error("session_closed");
          await session.send(userText);
        },

        async *stream(): AsyncGenerator<SessionTurnResult> {
          if (closed) throw new Error("session_closed");

          for await (const msg of session.stream()) {
            const text = extractAssistantText(msg);
            if (!text) continue;

            yield {
              text,
              usage: extractUsage(msg),
              sessionId: extractSessionId(msg) ?? args.sessionId,
            };
          }
        },

        close() {
          if (closed) return;
          closed = true;
          try {
            session.close?.();
          } catch {
            // ignore
          }
        },
      };
    },
  };
}