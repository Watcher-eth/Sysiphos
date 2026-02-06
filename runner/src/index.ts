// runner/src/index.ts
import { env } from "./env";
import { assertRunnerAuth, HttpError } from "./auth";
import { putText } from "./s3";

type SpawnSessionBody = {
  runId: string;
  programHash: string;

  // Phase 2+ (optional for now)
  agentType?: string;
  toolAllowlist?: string[];
  files?: Array<{
    contentRef: string;
    path: string;
    mode?: "ro" | "rw";
    sha256?: string;
    mime?: string;
    size?: number;
  }>;
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
  };
  error?: string;
};

// optional helper (Phase 2): runner pulls manifest if not provided
async function fetchMaterializeManifest(runId: string, programHash: string): Promise<MaterializeResponse["manifest"]> {
  const base = env.controlPlaneBaseUrl; // add to env
  if (!base) return undefined;

  const url = new URL("/api/runs/materialize", base);
  url.searchParams.set("runId", runId);
  url.searchParams.set("programHash", programHash);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-runner-token": env.runnerSharedSecret,
    },
  });

  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `materialize failed: ${text}`);
  const parsed = JSON.parse(text) as MaterializeResponse;
  if (!parsed.ok || !parsed.manifest) throw new HttpError(500, parsed.error ?? "materialize_invalid");
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
        const runId = body.runId;
        const programHash = body.programHash;

        if (!runId) throw new HttpError(400, "Missing runId");
        if (!programHash) throw new HttpError(400, "Missing programHash");

        // Phase 2: prefer explicit payload, otherwise pull manifest from control plane
        const manifest =
          body.toolAllowlist || body.files
            ? {
                toolAllowlist: body.toolAllowlist ?? [],
                files: body.files ?? [],
              }
            : await fetchMaterializeManifest(runId, programHash).catch(() => undefined);

        const sessionId = `sess_${crypto.randomUUID()}`;
        await new Promise((r) => setTimeout(r, 1200));

        const now = new Date().toISOString();
        const text =
          `Runner mock output\n` +
          `runId=${runId}\n` +
          `programHash=${programHash}\n` +
          `agentType=${body.agentType ?? "mock"}\n` +
          `toolAllowlist=${JSON.stringify(manifest?.toolAllowlist ?? [])}\n` +
          `files=${JSON.stringify((manifest?.files ?? []).map((f: any) => ({ path: f.path, mode: f.mode }))) }\n` +
          `createdAt=${now}\n`;

        const key = `${env.s3Prefix}/${runId}/bindings/result.txt`;
        const put = await putText(key, text, "text/plain");

        return json({
          ok: true,
          sessionId,
          status: "succeeded",
          outputs: {
            bindingName: "result",
            kind: "output",
            contentRef: put.contentRef,
            mime: put.mime,
            size: put.size,
            sha256: put.sha256,
            preview: text.slice(0, 200),
            summary: "Mock runner completed successfully.",
          },
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