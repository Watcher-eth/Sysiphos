import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { createHash } from "node:crypto";

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