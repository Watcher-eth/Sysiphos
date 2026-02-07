import { z } from "zod";

export const ToolCallZ = z.object({
  name: z.string().min(1),
  input: z.unknown(),
  toolUseId: z.string().optional(),
});

export type ToolCall = z.infer<typeof ToolCallZ>;

export type ToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string; data?: any } };

export type ToolCtx = {
  runId: string;
  programHash: string;
  principalId: string;
  agentName: string;
  sessionId?: string;

  workspaceDir: string;

  toolAllowlist: Set<string>;
  capabilities: Set<string>;

  filePolicy: {
    allowed: Array<{ path: string; mode: "ro" | "rw" }>;
    maxFileBytes: number;
  };

  netPolicy: {
    allowedDomains: Set<string>; // if empty => deny all
  };

  controlPlaneBaseUrl?: string;
  runnerSharedSecret?: string;
};