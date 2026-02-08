
export type AgentEventEnvelope = {
  v: 1;
  runId: string;
  programHash: string;
  principalId: string;
  agentName: string;
  sessionId?: string;

  // ✅ producer seq
  seq: number;

  ts: string;
  event: any;
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
};