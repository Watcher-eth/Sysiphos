import { db } from "@/lib/db";
import { runs, runPrograms, runFiles, runPermissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type SpawnManifest = {
  runId: string;
  program: { programHash: string; compilerVersion: string; programText: string };
  files: Array<{ contentRef: string; path: string; mode: "ro" | "rw"; sha256?: string | null; mime?: string | null; size?: number | null }>;
  toolAllowlist: string[]; // derived from permissions scope
  capabilities: string[]; // raw capabilities for runner gating
};

function sortBy<T>(arr: T[], key: (t: T) => string) {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)));
}

export async function buildSpawnManifest(runId: string, programHash: string): Promise<SpawnManifest> {
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run) throw new Error("run_not_found");

  const rp = await db.query.runPrograms.findFirst({ where: eq(runPrograms.runId, runId) });
  if (!rp) throw new Error("run_program_missing");
  if (rp.programHash !== programHash) throw new Error("run_program_hash_mismatch");

  const files = await db.query.runFiles.findMany({ where: eq(runFiles.runId, runId) });
  const perms = await db.query.runPermissions.findMany({ where: eq(runPermissions.runId, runId) });

  const capabilities = sortBy(perms.map((p) => p.capability), (x) => x);

  const toolAllowlist = sortBy(
    perms
      .filter((p) => p.capability === "tools.use" && p.scope)
      .map((p) => p.scope!) ,
    (x) => x
  );

  const sortedFiles = sortBy(
    files.map((f) => ({
      contentRef: f.contentRef,
      path: f.path,
      mode: f.mode,
      sha256: f.sha256 ?? null,
      mime: f.mime ?? null,
      size: f.size ?? null,
    })),
    (x) => x.path
  );

  return {
    runId,
    program: {
      programHash: rp.programHash,
      compilerVersion: rp.compilerVersion,
      programText: rp.programText,
    },
    files: sortedFiles,
    toolAllowlist,
    capabilities,
  };
}