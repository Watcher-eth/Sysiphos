import { z } from "zod";
import type { ToolDef } from "../registry";
import type { ToolCtx } from "../types";

async function cpGet<T>(ctx: ToolCtx, path: string) {
  if (!ctx.controlPlaneBaseUrl) throw new Error("control_plane_missing");
  const url = new URL(path, ctx.controlPlaneBaseUrl).toString();
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`control_plane_failed_${res.status}`);
  return (await res.json()) as T;
}

async function cpPost<T>(ctx: ToolCtx, path: string, body: any) {
  if (!ctx.controlPlaneBaseUrl) throw new Error("control_plane_missing");
  const url = new URL(path, ctx.controlPlaneBaseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-runner-token": ctx.runnerSharedSecret ?? "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`control_plane_failed_${res.status}`);
  return (await res.json()) as T;
}

export const ToolsSearch: ToolDef<any, any> = {
  name: "tools.search",
  input: z.object({ query: z.string().min(1), limit: z.number().optional() }),
  output: z.object({
    tools: z.array(
      z.object({
        toolName: z.string(),
        description: z.string().optional(),
        requiredCaps: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      })
    ),
  }),
  required: { tool: "tools.search", caps: ["tools.use"] },
  handler: async (ctx: ToolCtx, input) => {
    const q = encodeURIComponent(input.query);
    const lim = input.limit ? `&limit=${encodeURIComponent(String(input.limit))}` : "";
    const data = await cpGet<{ ok: boolean; tools: any[] }>(ctx, `/api/tools/search?q=${q}${lim}`);
    return { tools: Array.isArray(data.tools) ? data.tools : [] };
  },
};

export const ToolsRequest: ToolDef<any, any> = {
  name: "tools.request",
  input: z.object({
    grants: z.array(
      z.union([
        z.object({ kind: z.literal("tool"), toolName: z.string().min(1) }),
        z.object({ kind: z.literal("cap"), capability: z.string().min(1), scope: z.string().nullable().optional() }),
      ])
    ),
    reason: z.string().optional(),
  }),
  output: z.object({ granted: z.array(z.any()) }),
  required: { tool: "tools.request", caps: ["tools.use"] },
  handler: async (ctx: ToolCtx, input) => {
    const data = await cpPost<{ ok: boolean; granted: any[] }>(ctx, `/api/runs/${ctx.runId}/permissions/grant`, {
      grants: input.grants,
      reason: input.reason ?? "",
    });

    // Update in-memory permissions so subsequent calls succeed in the same run
    for (const g of input.grants) {
      if (g.kind === "tool") ctx.toolAllowlist.add(g.toolName);
      if (g.kind === "cap") ctx.capabilities.add(g.capability);
    }

    return { granted: Array.isArray(data.granted) ? data.granted : [] };
  },
};