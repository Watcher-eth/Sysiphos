export function mustEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
  }
  
  export const env = {
    port: Number(process.env.PORT ?? 8787),
    sharedSecret: mustEnv("RUNNER_SHARED_SECRET"),
    runnerSharedSecret: mustEnv("RUNNER_SHARED_SECRET"),
  controlPlaneBaseUrl: mustEnv("CONTROL_PLANE_BASE_URL"), // e.g. http://localhost:3000

    s3Endpoint: mustEnv("S3_ENDPOINT"),
    s3Region: process.env.S3_REGION ?? "auto",
    s3AccessKeyId: mustEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: mustEnv("S3_SECRET_ACCESS_KEY"),
    s3Bucket: mustEnv("S3_BUCKET"),
    s3Prefix: process.env.S3_PREFIX ?? "runs",
  };


  export const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL ?? "http://localhost:3000";
export const RUNNER_SHARED_SECRET = process.env.RUNNER_SHARED_SECRET ?? "";
if (!RUNNER_SHARED_SECRET) throw new Error("RUNNER_SHARED_SECRET missing");

  console.log("[runner env]", {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    prefix: process.env.S3_PREFIX,
  });