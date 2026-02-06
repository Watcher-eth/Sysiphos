// runner/src/materialize.ts
import { CONTROL_PLANE_URL, RUNNER_SHARED_SECRET } from "./env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { downloadToFile } from "./s3";
import { createHash, createHmac } from "node:crypto";

type Manifest = {
  runId: string;
  programHash: string;
  program: { inlineText: string };
  tools: string[];
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
  limits: { wallClockMs: number; maxFileBytes: number; maxArtifactBytes: number };
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

function canonicalBase(m: Manifest) {
  return {
    runId: m.runId,
    programHash: m.programHash,
    program: m.program,
    tools: m.tools,
    capabilities: m.capabilities,
    files: m.files,
    env: m.env,
    limits: m.limits,
  };
}

async function fetchManifest(runId: string, programHash: string): Promise<Manifest> {
  const url = `${CONTROL_PLANE_URL}/api/runs/materialize?runId=${encodeURIComponent(
    runId
  )}&programHash=${encodeURIComponent(programHash)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "x-runner-token": RUNNER_SHARED_SECRET },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`materialize ${res.status}: ${text}`);
  const json = JSON.parse(text);
  if (!json?.manifest) throw new Error("materialize_invalid_response");
  return json.manifest as Manifest;
}

export async function materializeWorkspace(params: {
  runId: string;
  programHash: string;
  workspaceDir: string;
}) {
  const { runId, programHash, workspaceDir } = params;

  const manifest = await fetchManifest(runId, programHash);

  if (manifest.runId !== runId) throw new Error("manifest_run_id_mismatch");
  if (manifest.programHash !== programHash) throw new Error("manifest_program_hash_mismatch");

   // 1) verify manifestHash
   const canon = stableJson(canonicalBase(manifest));
   const computedHash = sha256Hex(canon);
   if (computedHash !== manifest.manifestHash) {
     throw new Error(`manifest_hash_invalid expected=${manifest.manifestHash} got=${computedHash}`);
   }
 
   // 2) verify manifestSig (HMAC over manifestHash)
   const computedSig = hmacHex(RUNNER_SHARED_SECRET, manifest.manifestHash);
   if (computedSig !== manifest.manifestSig) {
     throw new Error(`manifest_sig_invalid expected=${manifest.manifestSig} got=${computedSig}`);
   }

  // 3) write program
  const programPath = join(workspaceDir, "program.prose");
  await mkdir(dirname(programPath), { recursive: true });
  await writeFile(programPath, manifest.program.inlineText, "utf8");

  // 4) materialize files
  for (const f of manifest.files) {
    const target = join(workspaceDir, f.path);
    await mkdir(dirname(target), { recursive: true });

    await downloadToFile({
      contentRef: f.contentRef,
      dstPath: target,
      expectedSha256: f.sha256 ?? undefined,
      maxBytes: manifest.limits.maxFileBytes,
    });
  }

  return { manifest, programPath };
}