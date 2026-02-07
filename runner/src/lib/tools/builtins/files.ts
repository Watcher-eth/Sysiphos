import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import type { ToolDef } from "../registry";
import type { ToolCtx } from "../types";

function resolveSafe(workspaceDir: string, p: string) {
  const abs = path.resolve(workspaceDir, p.replace(/^\/*/, ""));
  const base = path.resolve(workspaceDir);
  if (!abs.startsWith(base + path.sep) && abs !== base) throw new Error("files_path_escape");
  return abs;
}

function isAllowedFile(ctx: ToolCtx, p: string, want: "ro" | "rw") {
  const norm = p.replace(/\\/g, "/").replace(/^\/*/, "");
  const hit = ctx.filePolicy.allowed.find((f) => f.path.replace(/\\/g, "/").replace(/^\/*/, "") === norm);
  if (!hit) return false;
  if (want === "ro") return hit.mode === "ro" || hit.mode === "rw";
  return hit.mode === "rw";
}

export const FilesList: ToolDef<any, any> = {
  name: "files.list",
  input: z.object({ prefix: z.string().optional() }),
  output: z.object({ paths: z.array(z.string()) }),
  required: { tool: "files.list", caps: ["files.read"] },
  handler: async (ctx, input) => {
    const prefix = (input.prefix ?? "").replace(/\\/g, "/").replace(/^\/*/, "");
    const paths = ctx.filePolicy.allowed
      .map((f) => f.path.replace(/\\/g, "/").replace(/^\/*/, ""))
      .filter((p) => (prefix ? p.startsWith(prefix) : true))
      .sort();
    return { paths };
  },
};

export const FilesGet: ToolDef<any, any> = {
  name: "files.get",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({ text: z.string() }),
  required: { tool: "files.get", caps: ["files.read"] },
  handler: async (ctx: ToolCtx, input) => {
    if (!isAllowedFile(ctx, input.path, "ro")) throw new Error("files_denied");
    const abs = resolveSafe(ctx.workspaceDir, input.path);
    const stat = await fs.stat(abs);
    if (stat.size > ctx.filePolicy.maxFileBytes) throw new Error("files_too_large");
    const text = await fs.readFile(abs, "utf8");
    return { text };
  },
};

export const FilesPut: ToolDef<any, any> = {
  name: "files.put",
  input: z.object({ path: z.string().min(1), text: z.string() }),
  output: z.object({ ok: z.boolean() }),
  required: { tool: "files.put", caps: ["files.write"] },
  handler: async (ctx: ToolCtx, input) => {
    if (!isAllowedFile(ctx, input.path, "rw")) throw new Error("files_denied");
    const abs = resolveSafe(ctx.workspaceDir, input.path);
    const buf = Buffer.from(input.text, "utf8");
    if (buf.byteLength > ctx.filePolicy.maxFileBytes) throw new Error("files_too_large");
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return { ok: true };
  },
};