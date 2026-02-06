// runner/src/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Readable } from "node:stream";
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

type DownloadArgs = {
  contentRef: string; // key
  dstPath: string;
  expectedSha256?: string;
  maxBytes?: number;
};

class ByteLimitTransform extends (await import("node:stream")).Transform {
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

  // Hash + optional size cap while streaming
  const hashTap = new (await import("node:stream")).Transform({
    transform(chunk, _enc, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      hasher.update(buf);
      cb(null, buf);
    },
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