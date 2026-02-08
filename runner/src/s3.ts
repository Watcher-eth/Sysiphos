
// runner/src/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type PutResult = {
  contentRef: string; // key
  sha256: string;
  size: number;
  mime: string;
};

const s3 = new S3Client({
  region: env.s3Region,
  endpoint: env.s3Endpoint,
  credentials: {
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  },
});

export async function putText(key: string, text: string, mime = "text/plain"): Promise<PutResult> {
  const buf = Buffer.from(text, "utf8");
  const sha256 = createHash("sha256").update(buf).digest("hex");

  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: buf,
      ContentType: mime,
    })
  );

  return { contentRef: key, sha256, size: buf.length, mime };
}

// ✅ NEW: binary-safe put
export async function putBytes(
  key: string,
  bytes: Buffer,
  mime = "application/octet-stream"
): Promise<PutResult> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: bytes,
      ContentType: mime,
    })
  );

  return { contentRef: key, sha256, size: bytes.length, mime };
}

type DownloadArgs = {
  contentRef: string; // key
  dstPath: string;
  expectedSha256?: string;
  maxBytes?: number;
};

class ByteLimitTransform extends Transform {
  private seen = 0;
  constructor(private maxBytes: number) {
    super();
  }
  _transform(chunk: any, _enc: BufferEncoding, cb: (err?: Error) => void) {
    this.seen += chunk?.length ?? 0;
    if (this.seen > this.maxBytes) {
      cb(new Error(`download_exceeded_max_bytes (${this.seen} > ${this.maxBytes})`));
      return;
    }
    this.push(chunk);
    cb();
  }
}

class HashTapTransform extends Transform {
  constructor(private onChunk: (buf: Buffer) => void) {
    super();
  }
  _transform(chunk: any, _enc: BufferEncoding, cb: (err?: Error | null, data?: any) => void) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.onChunk(buf);
    cb(null, buf);
  }
}

export async function downloadToFile(args: DownloadArgs): Promise<{ sha256: string; size: number }> {
  const { contentRef, dstPath, expectedSha256, maxBytes } = args;

  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: contentRef,
    })
  );

  if (!resp.Body) throw new Error("s3_missing_body");

  await mkdir(dirname(dstPath), { recursive: true });

  const hasher = createHash("sha256");
  let size = 0;

  const readable = resp.Body as Readable;

  const hashTap = new HashTapTransform((buf) => {
    size += buf.length;
    hasher.update(buf);
  });

  const limiter = maxBytes ? new ByteLimitTransform(maxBytes) : null;
  const out = createWriteStream(dstPath);

  if (limiter) {
    await pipeline(readable, limiter, hashTap, out);
  } else {
    await pipeline(readable, hashTap, out);
  }

  const sha256 = hasher.digest("hex");

  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error(`sha256_mismatch expected=${expectedSha256} got=${sha256}`);
  }

  return { sha256, size };
}

async function readBodyToString(body: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

// ✅ NEW: read raw bytes
async function readBodyToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

export async function getTextIfExists(key: string): Promise<string | null> {
  try {
    const resp = await s3.send(
      new GetObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
      })
    );
    if (!resp.Body) return null;
    return await readBodyToString(resp.Body as Readable);
  } catch (e: any) {
    const msg = String(e?.name ?? e?.message ?? "");
    if (msg.includes("NoSuchKey") || msg.includes("NotFound")) return null;
    return null;
  }
}

// ✅ NEW: binary-safe get (used for checkpoints)
export async function getBytesIfExists(key: string): Promise<Buffer | null> {
  try {
    const resp = await s3.send(
      new GetObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
      })
    );
    if (!resp.Body) return null;
    return await readBodyToBuffer(resp.Body as Readable);
  } catch (e: any) {
    const msg = String(e?.name ?? e?.message ?? "");
    if (msg.includes("NoSuchKey") || msg.includes("NotFound")) return null;
    return null;
  }
}