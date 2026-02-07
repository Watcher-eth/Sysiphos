import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AgentEvent, AgentEventPayload } from "../prose/sessionAdapter";
import { putText, getTextIfExists, putBytes, getBytesIfExists } from "../../s3";

type Emit = (ev: AgentEvent) => void;

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureWithinRoot(root: string, rel: string) {
  const abs = path.resolve(root, rel);
  const relCheck = path.relative(root, abs);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) throw new Error("workspace_path_escape");
  return abs;
}

async function readFileSafe(abs: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

async function existsDir(abs: string): Promise<boolean> {
  try {
    const st = await fs.stat(abs);
    return st.isDirectory();
  } catch {
    return false;
  }
}

type FileMode = "ro" | "rw";

type CheckpointTouched = {
  path: string;
  existedBefore: boolean;
  shaBefore: string | null;
  bytesBefore: number | null;
  contentRefBefore: string | null;
};

type CheckpointManifest = {
  checkpointId: string;
  createdAt: string;
  label?: string;
  touched: CheckpointTouched[];
};

function checkpointKey(runId: string, checkpointId: string, relPath: string) {
  const prefix = process.env.S3_PREFIX ?? "runs";
  return `${prefix}/${runId}/checkpoints/${checkpointId}/before/${relPath}`;
}

function checkpointManifestKey(runId: string, checkpointId: string) {
  const prefix = process.env.S3_PREFIX ?? "runs";
  return `${prefix}/${runId}/checkpoints/${checkpointId}/manifest.json`;
}

function checkpointDropKey(runId: string, checkpointId: string) {
  const prefix = process.env.S3_PREFIX ?? "runs";
  return `${prefix}/${runId}/checkpoints/${checkpointId}/dropped.json`;
}

function versionKey(runId: string, opId: string, stage: "before" | "after", relPath: string) {
  const prefix = process.env.S3_PREFIX ?? "runs";
  return `${prefix}/${runId}/file_versions/${opId}/${stage}/${relPath}`;
}

async function scanDirBytes(absDir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    const p = path.join(absDir, ent.name);
    if (ent.isDirectory()) total += await scanDirBytes(p);
    else {
      const st = await fs.stat(p).catch(() => null);
      if (st?.isFile()) total += st.size;
    }
  }
  return total;
}

function bestPrefixMode(allow: Array<{ prefix: string; mode: FileMode }>, relPath: string): FileMode | null {
  // Longest-prefix match (supports directory allowlists).
  // Normalize to forward slashes for consistent prefix compares.
  const p = relPath.replaceAll("\\", "/");
  let best: { len: number; mode: FileMode } | null = null;

  for (const a of allow) {
    const pref = a.prefix.replaceAll("\\", "/").replace(/\/+$/g, "");
    const ok = p === pref || p.startsWith(pref + "/");
    if (!ok) continue;
    if (!best || pref.length > best.len) best = { len: pref.length, mode: a.mode };
  }

  return best ? best.mode : null;
}

export class WorkspaceFiles {
  private allow: Array<{ prefix: string; mode: FileMode }>;
  private maxFileBytes: number | null;
  private maxWorkspaceBytes: number | null;
  private versioning: boolean;

  private workspaceBytesKnown: number | null = null;

  constructor(
    private readonly args: {
      runId: string;
      workspaceDir: string;
      emit: Emit;
      principalId?: string;
      agentName?: string;

      // ✅ enforcement inputs (from manifest)
      allowlist?: Array<{ path: string; mode: FileMode }>;
      maxFileBytes?: number | null;
      maxWorkspaceBytes?: number | null; // optional (can reuse maxArtifactBytes if you want)
      versioning?: boolean;
      enforceAllowlist?: boolean; // default true when allowlist provided
    }
  ) {
    this.allow = (args.allowlist ?? []).map((x) => ({ prefix: x.path, mode: x.mode }));
    this.maxFileBytes = args.maxFileBytes ?? null;
    this.maxWorkspaceBytes = args.maxWorkspaceBytes ?? null;
    this.versioning = Boolean(args.versioning);

    // If allowlist exists, we enforce by default.
    if (args.enforceAllowlist === false) {
      // no-op (keeps allowlist but doesn’t enforce)
    }
  }

  private emit(ev: AgentEventPayload) {
    this.args.emit({
      ...ev,
      principalId: this.args.principalId,
      agentName: this.args.agentName,
    } as AgentEvent);
  }

  private modeFor(relPath: string): FileMode | null {
    if (!this.allow.length) return null;
    return bestPrefixMode(this.allow, relPath);
  }

  private assertCanRead(relPath: string) {
    if (!this.allow.length) return;
    const mode = this.modeFor(relPath);
    if (!mode) throw new Error("workspace_read_forbidden");
  }

  private assertCanWrite(relPath: string) {
    if (!this.allow.length) return;
    const mode = this.modeFor(relPath);
    if (mode !== "rw") throw new Error("workspace_write_forbidden");
  }

  private async assertFileSizeWithinLimit(bytes: number) {
    if (this.maxFileBytes != null && bytes > this.maxFileBytes) {
      throw new Error(`workspace_file_too_large (${bytes} > ${this.maxFileBytes})`);
    }
  }

  private async ensureWorkspaceQuota(deltaBytes: number) {
    if (this.maxWorkspaceBytes == null) return;

    if (this.workspaceBytesKnown == null) {
      this.workspaceBytesKnown = await scanDirBytes(this.args.workspaceDir);
    }

    const next = (this.workspaceBytesKnown ?? 0) + deltaBytes;
    if (next > this.maxWorkspaceBytes) {
      throw new Error(`workspace_quota_exceeded (${next} > ${this.maxWorkspaceBytes})`);
    }

    this.workspaceBytesKnown = next;
  }

  async listDir(relDir: string) {
    this.assertCanRead(relDir);
    const abs = ensureWithinRoot(this.args.workspaceDir, relDir);
    const ok = await existsDir(abs);
    if (!ok) return [];
    const entries = await fs.readdir(abs);
    this.emit({ type: "file", op: "opened", path: relDir, data: { entries: entries.length } });
    return entries;
  }

  async readText(relPath: string) {
    this.assertCanRead(relPath);
    const abs = ensureWithinRoot(this.args.workspaceDir, relPath);
    const buf = await readFileSafe(abs);
    if (!buf) return null;
    const sha = sha256Hex(buf);
    this.emit({ type: "file", op: "read", path: relPath, bytesAfter: buf.length, shaAfter: sha });
    return buf.toString("utf8");
  }

  async readBytes(relPath: string) {
    this.assertCanRead(relPath);
    const abs = ensureWithinRoot(this.args.workspaceDir, relPath);
    const buf = await readFileSafe(abs);
    if (!buf) return null;
    const sha = sha256Hex(buf);
    this.emit({ type: "file", op: "read", path: relPath, bytesAfter: buf.length, shaAfter: sha, mime: "application/octet-stream" });
    return buf;
  }

  async createCheckpoint(paths: string[], label?: string) {
    const checkpointId = randomUUID();
    const touched: CheckpointTouched[] = [];

    // prevent restore if dropped later
    const dropped = await getTextIfExists(checkpointDropKey(this.args.runId, checkpointId));
    if (dropped) throw new Error("checkpoint_already_dropped");

    for (const rel of paths) {
      this.assertCanRead(rel);
      const abs = ensureWithinRoot(this.args.workspaceDir, rel);
      const before = await readFileSafe(abs);

      if (!before) {
        touched.push({ path: rel, existedBefore: false, shaBefore: null, bytesBefore: null, contentRefBefore: null });
        continue;
      }

      const shaBefore = sha256Hex(before);
      const bytesBefore = before.length;

      const key = checkpointKey(this.args.runId, checkpointId, rel);
      const put = await putBytes(key, before, "application/octet-stream");

      touched.push({
        path: rel,
        existedBefore: true,
        shaBefore,
        bytesBefore,
        contentRefBefore: put.contentRef,
      });
    }

    const manifest: CheckpointManifest = {
      checkpointId,
      createdAt: new Date().toISOString(),
      label,
      touched,
    };

    await putText(checkpointManifestKey(this.args.runId, checkpointId), JSON.stringify(manifest), "application/json");

    const bytesTotal = touched.reduce((a, x) => a + (x.bytesBefore ?? 0), 0);

    this.emit({
      type: "checkpoint",
      op: "create",
      checkpointId,
      label,
      fileCount: touched.length,
      bytesTotal,
    });

    return checkpointId;
  }

  async dropCheckpoint(checkpointId: string, reason?: string) {
    await putText(
      checkpointDropKey(this.args.runId, checkpointId),
      JSON.stringify({ checkpointId, droppedAt: new Date().toISOString(), reason: reason ?? null }),
      "application/json"
    );

    this.emit({ type: "checkpoint", op: "drop", checkpointId, data: { reason: reason ?? null } });
  }

  async restoreCheckpoint(checkpointId: string) {
    const dropped = await getTextIfExists(checkpointDropKey(this.args.runId, checkpointId));
    if (dropped) throw new Error("checkpoint_dropped");

    const raw = await getTextIfExists(checkpointManifestKey(this.args.runId, checkpointId));
    if (!raw) throw new Error("checkpoint_not_found");

    const manifest = JSON.parse(raw) as CheckpointManifest;

    for (const t of manifest.touched) {
      // restore is a write
      this.assertCanWrite(t.path);

      const abs = ensureWithinRoot(this.args.workspaceDir, t.path);

      if (!t.existedBefore) {
        await fs.rm(abs, { force: true }).catch(() => {});
        this.emit({ type: "file", op: "deleted", path: t.path, data: { via: "checkpoint_restore" } });
        continue;
      }

      if (!t.contentRefBefore) continue;
      const beforeBytes = await getBytesIfExists(t.contentRefBefore);
      if (!beforeBytes) continue;

      await this.assertFileSizeWithinLimit(beforeBytes.length);

      // quota delta: replace existing file size with restored size (best-effort)
      const current = await readFileSafe(abs);
      const currentBytes = current?.length ?? 0;
      await this.ensureWorkspaceQuota(beforeBytes.length - currentBytes);

      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, beforeBytes);

      this.emit({
        type: "file",
        op: "edited",
        path: t.path,
        bytesAfter: beforeBytes.length,
        shaAfter: sha256Hex(beforeBytes),
        contentRefAfter: t.contentRefBefore, // restored to the checkpoint snapshot
        data: { via: "checkpoint_restore" },
      });
    }

    this.emit({ type: "checkpoint", op: "restore", checkpointId });
  }

  async writeText(relPath: string, text: string, opts?: { mime?: string | null; checkpointId?: string | null }) {
    this.assertCanWrite(relPath);

    const abs = ensureWithinRoot(this.args.workspaceDir, relPath);

    const before = await readFileSafe(abs);
    const shaBefore = before ? sha256Hex(before) : null;
    const bytesBefore = before ? before.length : null;

    const after = Buffer.from(text, "utf8");
    await this.assertFileSizeWithinLimit(after.length);
    await this.ensureWorkspaceQuota(after.length - (bytesBefore ?? 0));

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, after);

    const shaAfter = sha256Hex(after);

    let contentRefBefore: string | null = null;
    let contentRefAfter: string | null = null;

    if (this.versioning) {
      const opId = randomUUID();
      if (before) {
        const putB = await putBytes(versionKey(this.args.runId, opId, "before", relPath), before, "application/octet-stream");
        contentRefBefore = putB.contentRef;
      }
      const putA = await putBytes(versionKey(this.args.runId, opId, "after", relPath), after, opts?.mime ?? "text/plain");
      contentRefAfter = putA.contentRef;
    }

    this.emit({
      type: "file",
      op: before ? "edited" : "created",
      path: relPath,
      bytesBefore,
      bytesAfter: after.length,
      shaBefore,
      shaAfter,
      contentRefBefore,
      contentRefAfter,
      mime: opts?.mime ?? "text/plain",
      data: { checkpointId: opts?.checkpointId ?? null },
    });
  }

  async writeBytes(relPath: string, bytes: Buffer, opts?: { mime?: string | null; checkpointId?: string | null }) {
    this.assertCanWrite(relPath);

    const abs = ensureWithinRoot(this.args.workspaceDir, relPath);

    const before = await readFileSafe(abs);
    const shaBefore = before ? sha256Hex(before) : null;
    const bytesBefore = before ? before.length : null;

    await this.assertFileSizeWithinLimit(bytes.length);
    await this.ensureWorkspaceQuota(bytes.length - (bytesBefore ?? 0));

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);

    const shaAfter = sha256Hex(bytes);

    let contentRefBefore: string | null = null;
    let contentRefAfter: string | null = null;

    if (this.versioning) {
      const opId = randomUUID();
      if (before) {
        const putB = await putBytes(versionKey(this.args.runId, opId, "before", relPath), before, "application/octet-stream");
        contentRefBefore = putB.contentRef;
      }
      const putA = await putBytes(versionKey(this.args.runId, opId, "after", relPath), bytes, opts?.mime ?? "application/octet-stream");
      contentRefAfter = putA.contentRef;
    }

    this.emit({
      type: "file",
      op: before ? "edited" : "created",
      path: relPath,
      bytesBefore,
      bytesAfter: bytes.length,
      shaBefore,
      shaAfter,
      contentRefBefore,
      contentRefAfter,
      mime: opts?.mime ?? "application/octet-stream",
      data: { checkpointId: opts?.checkpointId ?? null },
    });
  }

  async deleteFile(relPath: string, opts?: { checkpointId?: string | null }) {
    this.assertCanWrite(relPath);

    const abs = ensureWithinRoot(this.args.workspaceDir, relPath);

    const before = await readFileSafe(abs);
    const shaBefore = before ? sha256Hex(before) : null;
    const bytesBefore = before ? before.length : null;

    // quota delta: subtract file size
    await this.ensureWorkspaceQuota(-(bytesBefore ?? 0));

    await fs.rm(abs, { force: true });

    let contentRefBefore: string | null = null;
    if (this.versioning && before) {
      const opId = randomUUID();
      const putB = await putBytes(versionKey(this.args.runId, opId, "before", relPath), before, "application/octet-stream");
      contentRefBefore = putB.contentRef;
    }

    this.emit({
      type: "file",
      op: "deleted",
      path: relPath,
      bytesBefore,
      bytesAfter: 0,
      shaBefore,
      shaAfter: null,
      contentRefBefore,
      contentRefAfter: null,
      data: { checkpointId: opts?.checkpointId ?? null },
    });
  }

  async mkdir(relDir: string) {
    this.assertCanWrite(relDir);
    const abs = ensureWithinRoot(this.args.workspaceDir, relDir);
    await fs.mkdir(abs, { recursive: true });
    this.emit({ type: "file", op: "mkdir", path: relDir });
  }

  async rmdir(relDir: string) {
    this.assertCanWrite(relDir);
    const abs = ensureWithinRoot(this.args.workspaceDir, relDir);
    await fs.rm(abs, { recursive: true, force: true });
    this.emit({ type: "file", op: "rmdir", path: relDir });
  }

  async move(from: string, to: string, opts?: { checkpointId?: string | null }) {
    this.assertCanWrite(from);
    this.assertCanWrite(to);

    const fromAbs = ensureWithinRoot(this.args.workspaceDir, from);
    const toAbs = ensureWithinRoot(this.args.workspaceDir, to);

    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    await fs.rename(fromAbs, toAbs);

    this.emit({ type: "file", op: "moved", path: from, toPath: to, data: { checkpointId: opts?.checkpointId ?? null } });
  }

  async copy(from: string, to: string, opts?: { checkpointId?: string | null }) {
    this.assertCanRead(from);
    this.assertCanWrite(to);

    const fromAbs = ensureWithinRoot(this.args.workspaceDir, from);
    const toAbs = ensureWithinRoot(this.args.workspaceDir, to);

    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    const buf = await fs.readFile(fromAbs);

    await this.assertFileSizeWithinLimit(buf.length);

    // quota delta: add new file size (best-effort)
    const existing = await readFileSafe(toAbs);
    const existingBytes = existing?.length ?? 0;
    await this.ensureWorkspaceQuota(buf.length - existingBytes);

    await fs.writeFile(toAbs, buf);

    this.emit({
      type: "file",
      op: "copied",
      path: from,
      toPath: to,
      bytesAfter: buf.length,
      shaAfter: sha256Hex(buf),
      data: { checkpointId: opts?.checkpointId ?? null },
    });
  }
}