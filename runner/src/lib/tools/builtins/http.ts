import { z } from "zod";
import type { ToolDef } from "../registry";
import type { ToolCtx } from "../types";

function hostOf(u: string) {
  const url = new URL(u);
  return url.hostname.toLowerCase();
}

export const HttpFetch: ToolDef<any, any> = {
  name: "http.fetch",
  input: z.object({
    url: z.string().min(1),
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
  output: z.object({ status: z.number(), text: z.string() }),
  required: { tool: "http.fetch", caps: ["net.egress"] },
  handler: async (ctx: ToolCtx, input) => {
    const host = hostOf(input.url);
    if (!ctx.netPolicy.allowedDomains.has(host) && !ctx.netPolicy.allowedDomains.has("*")) {
      throw new Error("net_domain_denied");
    }
    const res = await fetch(input.url, {
      method: input.method ?? "GET",
      headers: input.headers,
      body: input.body,
    });
    const text = await res.text();
    return { status: res.status, text };
  },
};