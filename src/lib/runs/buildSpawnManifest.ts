// src/lib/runs/buildSpawnManifest.ts
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createHash, createHmac } from "node:crypto";

export type SpawnManifest = {
  runId: string;
  programHash: string;
  program: { inlineText: string };
  tools: string[];
  capabilities: Array<{ capability: string; scope: string | null }>;
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
  manifestHash: string;
  manifestSig: string; // ✅ NEW
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
  const s = process.env.RUNNER_SHARED_SECRET; // reuse shared secret for now
  // (better: CONTROL_PLANE_MANIFEST_SECRET, but keeping it simple)
  if (!s) throw new Error("RUNNER_SHARED_SECRET missing (needed for manifest signing)");
  return s;
}

export async function buildSpawnManifest(params: {
  runId: string;
  programHash: string;
}): Promise<SpawnManifest> {
  const { runId, programHash } = params;

  // 1) program text (authoritative)
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

  // 2) permissions -> tools/capabilities
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

    const capabilities = perms.map((p) => ({ capability: String(p.capability), scope: (p.scope ?? null) as string | null }));
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

  // 4) env + limits
  const env: Record<string, string> = {};
  const limits = {
    wallClockMs: 60_000,
    maxFileBytes: 50 * 1024 * 1024,
    maxArtifactBytes: 50 * 1024 * 1024,
  };
  const base = {
    runId,
    programHash,
    program: { inlineText: prog[0].programText },
    tools: toolAllowlist,
    capabilities,
    files: sortedFiles,
    env,
    limits,
  };

  const canon = stableJson(base);
  const manifestHash = sha256Hex(canon);

  const secret = mustSigningSecret();
  const manifestSig = hmacHex(secret, canon);

  return {
    ...base,
    manifestHash,
    manifestSig,
  };
}