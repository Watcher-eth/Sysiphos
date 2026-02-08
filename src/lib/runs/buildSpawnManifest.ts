import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createHash, createHmac } from "node:crypto";

export type ToolDefForModel = {
  name: string;
  description?: string;
  input_schema?: any;
};

export type SpawnManifest = {
  runId: string;
  programHash: string;
  programText: string;

  toolAllowlist: string[];
  capabilities: string[];

  files: Array<{
    contentRef: string;
    path: string;
    mode: "ro" | "rw";
    sha256: string | null;
    mime: string | null;
    size: number | null;
  }>;

  env: Record<string, string>;
  limits: {
    wallClockMs: number;
    maxFileBytes: number;
    maxArtifactBytes: number;
  };

  tools?: ToolDefForModel[];

  mcpServers?: Record<string, any>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | string;

  manifestHash: string;
  manifestSig: string;
};

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableJson(value[k])).join(",")}}`;
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function hmacHex(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function mustSigningSecret() {
  const s = process.env.RUNNER_SHARED_SECRET;
  if (!s) throw new Error("RUNNER_SHARED_SECRET missing (needed for manifest signing)");
  return s;
}

function canonicalBase(m: Omit<SpawnManifest, "manifestHash" | "manifestSig">) {
  return {
    runId: m.runId,
    programHash: m.programHash,
    programText: m.programText,
    toolAllowlist: m.toolAllowlist,
    capabilities: m.capabilities,
    files: m.files,
    env: m.env,
    limits: m.limits,

    tools: m.tools ?? null,

    mcpServers: m.mcpServers ?? null,
    permissionMode: m.permissionMode ?? null,
  };
}

function asObj(v: any): Record<string, any> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as any;
}

function asStrArr(v: any): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map(String).filter(Boolean);
}

function filterEnvByAllowlist(env: Record<string, string>, allowlist?: string[]) {
  if (!allowlist || !allowlist.length) return env;
  const allow = new Set(allowlist);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (allow.has(k)) out[k] = v;
  }
  return out;
}

function asTools(v: any): ToolDefForModel[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ToolDefForModel[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") continue;
    const name = String((t as any).name ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      description: typeof (t as any).description === "string" ? (t as any).description : "",
      input_schema: (t as any).input_schema ?? { type: "object", properties: {}, additionalProperties: false },
    });
  }
  return out.length ? out : undefined;
}

export async function buildSpawnManifest(params: {
  runId: string;
  programHash: string;
}): Promise<SpawnManifest> {
  const { runId, programHash } = params;

  // 0) pinned run execution spec
  const runRow = await db
    .select({
      executionSpec: (schema.runs as any).executionSpec,
    })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId as any))
    .limit(1);

  const execSpec = (runRow[0]?.executionSpec ?? {}) as any;

  // 1) program text
  const prog = await db
    .select({
      programText: schema.runPrograms.programText,
      programHash: schema.runPrograms.programHash,
    })
    .from(schema.runPrograms)
    .where(eq(schema.runPrograms.runId, runId as any))
    .limit(1);

  if (!prog[0]) throw new Error("run_program_missing");
  if (prog[0].programHash !== programHash) throw new Error("program_hash_mismatch");

  // 2) permissions
  const perms = await db
    .select({
      capability: schema.runPermissions.capability,
      scope: schema.runPermissions.scope,
    })
    .from(schema.runPermissions)
    .where(eq(schema.runPermissions.runId, runId as any));

  const toolAllowlist = perms
    .filter((p) => p.capability === "tools.use" && p.scope)
    .map((p) => String(p.scope))
    .sort();

  const capabilities = perms
    .filter((p) => p.capability && p.capability !== "tools.use")
    .map((p) => String(p.capability))
    .sort();

  // 3) files
  const files = await db
    .select({
      contentRef: schema.runFiles.contentRef,
      path: schema.runFiles.path,
      mode: schema.runFiles.mode,
      sha256: schema.runFiles.sha256,
      mime: schema.runFiles.mime,
      size: schema.runFiles.size,
    })
    .from(schema.runFiles)
    .where(eq(schema.runFiles.runId, runId as any));

  const sortedFiles = files
    .map((f) => ({
      contentRef: String(f.contentRef),
      path: String(f.path),
      mode: (String(f.mode) as "ro" | "rw") ?? "ro",
      sha256: (f.sha256 ?? null) as string | null,
      mime: (f.mime ?? null) as string | null,
      size: (f.size ?? null) as number | null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // 4) env/limits + tools/mcp from execSpec
  const envBase: Record<string, string> = { ...(asObj(execSpec.env) ?? {}) };

  const limits = {
    wallClockMs: Number(execSpec?.limits?.wallClockMs ?? 60_000),
    maxFileBytes: Number(execSpec?.limits?.maxFileBytes ?? 50 * 1024 * 1024),
    maxArtifactBytes: Number(execSpec?.limits?.maxArtifactBytes ?? 50 * 1024 * 1024),
  };

  const tools = asTools(execSpec.tools);
  const mcpServers = asObj(execSpec.mcpServers);
  const permissionMode =
    typeof execSpec.permissionMode === "string" ? (execSpec.permissionMode as any) : undefined;

  if (tools?.some((t) => t.name.startsWith("mcp__"))) {
    throw new Error("invalid_tool_name_prefix_mcp");
  }

  const mcpServerNames = new Set(Object.keys(mcpServers ?? {}));
  const mcpAllowlist = toolAllowlist.filter((n) => n.startsWith("mcp__"));
  if (mcpAllowlist.length && mcpServerNames.size === 0) {
    throw new Error("mcp_allowlist_without_servers");
  }
  for (const entry of mcpAllowlist) {
    const m = entry.match(/^mcp__([^_]+)__/);
    if (!m) continue;
    const server = m[1];
    if (server !== "*" && !mcpServerNames.has(server)) {
      throw new Error(`mcp_allowlist_missing_server:${server}`);
    }
  }

  const envAllowlist = asStrArr(execSpec.envAllowlist);
  const env = filterEnvByAllowlist(envBase, envAllowlist);
  const hasSensitiveEnv = Object.keys(env).some(
    (k) => k.startsWith("INTEGRATION_") || k.startsWith("CONNECTOR_") || k.startsWith("OAUTH_")
  );
  if (hasSensitiveEnv && !capabilities.includes("connectors.use")) {
    throw new Error("connectors_permission_required_for_env");
  }


  const base: Omit<SpawnManifest, "manifestHash" | "manifestSig"> = {
    runId,
    programHash,
    programText: prog[0].programText,

    toolAllowlist,
    capabilities,

    files: sortedFiles,
    env,
    limits,

    tools,
    mcpServers,
    permissionMode,
  };

  const canon = stableJson(canonicalBase(base));
  const manifestHash = sha256Hex(canon);

  const secret = mustSigningSecret();
  const manifestSig = hmacHex(secret, manifestHash);

  return { ...base, manifestHash, manifestSig };
}