// runner/src/prose/sessionAdapter.ts
import { makeClaudeAdapter } from "./adapters/claudeV2";
import type { EventBufferOptions } from "../events/buffer";

export interface SessionHandle {
  send(userText: string): Promise<void>;
  stream(): AsyncGenerator<SessionTurnResult>;
  close(): void;
}

export interface SessionAdapter {
  createSession(args: SessionCreateArgs): Promise<SessionHandle>;
  resumeSession(args: SessionCreateArgs & { sessionId: string }): Promise<SessionHandle>;
}

export type TodoEvent = Extract<AgentEvent, { type: "todo" }>;
export type TodoOp = TodoEvent["op"];

export type AgentEventBase = { principalId?: string; agentName?: string };

export type AgentEvent =
  & AgentEventBase
  & (
    | { type: "session_started"; sessionId?: string }
    | { type: "session_resumed"; sessionId: string }
    | { type: "thinking"; text: string }
    | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string; data?: any }
    | { type: "step"; status: "started" | "completed" | "failed"; name: string; detail?: string; data?: any }
    | { type: "todo"; op: "add" | "update" | "complete" | "remove"; id: string; text?: string; status?: string; data?: any }
    | { type: "artifact"; name: string; contentRef: string; mime?: string; size?: number; sha256?: string; action?: string; path?: string }
    | { type: "result_text"; text: string }
    | { type: "raw"; provider: "claude"; payload: any }
    | {
        type: "checkpoint";
        op: "create" | "restore" | "drop";
        checkpointId: string;
        label?: string;
        fileCount?: number;
        bytesTotal?: number;
        data?: any;
      }
    | {
        type: "file";
        op: "opened" | "read" | "created" | "edited" | "deleted" | "moved" | "copied" | "mkdir" | "rmdir";
        path: string;
        toPath?: string;
        bytesBefore?: number | null;
        bytesAfter?: number | null;
        shaBefore?: string | null;
        shaAfter?: string | null;
        contentRefBefore?: string | null;
        contentRefAfter?: string | null;
        mime?: string | null;
        data?: any;
      }
  );

// ✅ distributive omit over the union (this fixes your error)
export type AgentEventPayload =
  AgentEvent extends infer U
    ? U extends any
      ? Omit<U, "principalId" | "agentName">
      : never
    : never;

export type FileEvent = Extract<AgentEvent, { type: "file" }>;
export type FileOp = FileEvent["op"];
export type CheckpointEvent = Extract<AgentEvent, { type: "checkpoint" }>;
export type CheckpointOp = CheckpointEvent["op"];

export type SessionTurnResult = {
  sessionId?: string;
  usage?: {
    messageId?: string;
    tokensIn?: number;
    tokensOut?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    totalCostUsd?: number;
    modelUsage?: Record<string, any>;
    costCredits?: number;
    isFinal?: boolean;
  };
  event?: AgentEvent;
  // legacy support (optional)
  text?: string;
};

export type ToolHandler = (call: {
  name: string;
  input: unknown;
  toolUseId?: string;
}) => Promise<
  | { ok: true; output: any }
  | { ok: false; error: { code: string; message: string; data?: any } }
>;

// ✅ supports either "custom tool def" OR "native tool def" passthrough
export type ToolDefForModel =
  | {
      // custom tools
      name: string;
      description?: string;
      input_schema?: any; // json schema derived from zod
    }
  | {
      // native tools (Agent SDK / Anthropic tools), passed through as-is
      type: string;
      name: string;
      [k: string]: any;
    };

export type SessionCreateArgs = {
  model?: string;
  system?: string;
  memoryText?: string | null;

  sessionId?: string | null;
  idempotencyKey?: string | null;

  principalId?: string;
  agentName?: string;

  runId?: string;
  workspaceDir?: string;

  // ✅ workspace file guardrails
  workspaceAllowlist?: string[];
  maxFileBytes?: number;
  maxWorkspaceBytes?: number;

  // ✅ event buffer / signing context
  programHash?: string;
  eventBufferOptions?: EventBufferOptions;

  // ✅ tool calling
  toolHandler?: ToolHandler;

  // ✅ tools exposed to model (name/description/schema)
  tools?: ToolDefForModel[];

  // ✅ MCP + permissions (new spec)
  mcpServers?: Record<string, any>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;

  // ✅ SDK env passthrough (ENABLE_TOOL_SEARCH etc)
  env?: Record<string, string>;
  _effectiveAllow?: string[];

};

export function makeMockAdapter(): SessionAdapter {
  return {
    async createSession(_args) {
      let lastUser = "";
      const sid = `mock_${crypto.randomUUID()}`;
      return {
        async send(userText) {
          lastUser = userText;
        },
        async *stream() {
          yield {
            sessionId: sid,
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
      const h = await this.createSession(args);
      const sid = args.sessionId;
      return {
        ...h,
        async *stream() {
          for await (const t of h.stream()) {
            yield { ...t, sessionId: sid };
          }
        },
      };
    },
  };
}

export async function makeAdapterFromEnv(): Promise<SessionAdapter> {
  const provider = (process.env.AGENT_PROVIDER ?? "claude").toLowerCase();
  if (provider === "claude") return makeClaudeAdapter();
  return makeClaudeAdapter();
}