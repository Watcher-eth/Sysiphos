// runner/src/index.ts
import { env } from "./env";
import { assertRunnerAuth, HttpError } from "./auth";
import { parseProse } from "./prose/parse";
import { executeProse } from "./prose/runtime";
import { makeAdapterFromEnv } from "./prose/sessionAdapter";

type SpawnSessionBody = {
  runId: string;
  programHash: string;

  agentType?: string;

  // Phase 2+: can override manifest pieces, but if you do, you MUST also provide programText.
  toolAllowlist?: string[];
  files?: Array<{
    contentRef: string;
    path: string;
    mode?: "ro" | "rw";
    sha256?: string;
    mime?: string;
    size?: number;
  }>;
  programText?: string;
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

type MaterializeResponse = {
  ok: boolean;
  manifest?: {
    runId: string;
    programHash: string;
    programText: string; // ✅ required now
    toolAllowlist: string[];
    capabilities: string[];
    files: Array<{
      contentRef: string;
      path: string;
      mode: "ro" | "rw";
      sha256?: string | null;
      mime?: string | null;
      size?: number | null;
    }>;
    env: Record<string, string>;
    limits: { wallClockMs: number; maxFileBytes: number; maxArtifactBytes: number };
    manifestHash?: string;
    manifestSig?: string;
  };
  error?: string;
};

async function fetchMaterializeManifest(
  runId: string,
  programHash: string
): Promise<MaterializeResponse["manifest"]> {
  const base = env.controlPlaneBaseUrl;
  if (!base) return undefined;

  const url = new URL("/api/runs/materialize", base);
  url.searchParams.set("runId", runId);
  url.searchParams.set("programHash", programHash);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-runner-token": env.sharedSecret,
    },
  });

  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `materialize failed: ${text}`);

  const parsed = JSON.parse(text) as MaterializeResponse;
  if (!parsed.ok || !parsed.manifest) throw new HttpError(500, parsed.error ?? "materialize_invalid");

  if (!parsed.manifest.programText) throw new HttpError(500, "materialize_missing_programText");

  return parsed.manifest;
}

Bun.serve({
  port: env.port,
  async fetch(req) {
    try {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true });
      }

      if (req.method === "POST" && url.pathname === "/spawn-session") {
        assertRunnerAuth(req.headers);

        const body = await readJson<SpawnSessionBody>(req);
        const { runId, programHash } = body;

        if (!runId) throw new HttpError(400, "Missing runId");
        if (!programHash) throw new HttpError(400, "Missing programHash");

        // If caller overrides allowlist/files, require they also pass programText (otherwise you can't execute).
        const hasOverrides = Boolean(body.toolAllowlist || body.files || body.programText);

        const fetched = hasOverrides
          ? undefined
          : await fetchMaterializeManifest(runId, programHash).catch(() => undefined);

        const programText = body.programText ?? fetched?.programText ?? "";
        if (!programText) throw new HttpError(400, "Missing programText");

        const manifest = {
          runId,
          programHash,
          programText, // ✅ canonical field

          toolAllowlist: body.toolAllowlist ?? fetched?.toolAllowlist ?? [],
          capabilities: fetched?.capabilities ?? [],
          files: (body.files ?? fetched?.files ?? []).map((f) => ({
            contentRef: f.contentRef,
            path: f.path,
            mode: (f.mode ?? "ro") as "ro" | "rw",
            sha256: f.sha256 ?? null,
            mime: f.mime ?? null,
            size: f.size ?? null,
          })),
          env: fetched?.env ?? {},
          limits:
            fetched?.limits ?? {
              wallClockMs: 60_000,
              maxFileBytes: 25_000_000,
              maxArtifactBytes: 5_000_000,
            },
        };

        const sessionId = `sess_${crypto.randomUUID()}`;

        const adapter = await makeAdapterFromEnv();
        const program = parseProse(manifest.programText);
        const exec = await executeProse({ manifest: manifest as any, program, adapter });

        return json({
          ok: true,
          sessionId,
          status: "succeeded",
          outputs: exec.outputs.map((o) => ({
            bindingName: o.name,
            kind: o.kind,
            contentRef: o.contentRef,
            mime: o.mime,
            size: o.size,
            sha256: o.sha256,
            preview: o.preview,
            summary: o.summary,
          })),
          usage: exec.usage,
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (e: any) {
      if (e?.status) return json({ ok: false, error: e.message }, e.status);
      console.error("runner error:", e);
      return json({ ok: false, error: "Internal Server Error" }, 500);
    }
  },
});

console.log(`[runner] listening on :${env.port}`);