"use client";

import * as React from "react";
import { useRouter } from "next/router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileIcon,
  FileText,
  GitPullRequestArrow,
  Loader2,
  Mail,
  MoreHorizontal,
  PlusIcon,
  Share2,
  SheetIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Deliverable, Deliverables } from "@/components/review/deliverables";

type TaskStatus = "review" | "success" | "in_progress" | "error";
type StepStatus = "done" | "pending_review" | "running" | "todo" | "error";
type TodoStatus = "pending" | "in_progress" | "completed";

type TimelineItem = {
  id: string;
  text: string;
  at: string; // "Mar 24, 16:45"
  status?: StepStatus;
};

type TodoItem = {
  id: string;
  text: string;
  status?: TodoStatus;
};




function PageHeader({
  title,
  description,
  updatedLabel,
}: {
  title: string;
  description: string;
  updatedLabel: string;
}) {
  return (
    <div className="pt-10">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <FileText className="h-4 w-4 text-neutral-400" />
          <span className="font-medium text-neutral-800">{title}</span>
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-sm text-neutral-400 md:block">{updatedLabel}</div>

          <div className="hidden items-center -space-x-2 md:flex">
            <div className="h-7 w-7 rounded-full bg-neutral-200 ring-2 ring-white" />
            <div className="h-7 w-7 rounded-full bg-neutral-300 ring-2 ring-white" />
            <div className="h-7 w-7 rounded-full bg-neutral-200 ring-2 ring-white" />
          </div>

          <Button variant="outline" className="h-9 rounded-full px-3">
            <Copy className="mr-0 h-4 w-4" />
            Copy link
          </Button>
          <Button className="h-9 rounded-full bg-sky-500 px-4 text-white hover:bg-sky-600">
            Share
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <MoreHorizontal className="h-5 w-5 text-neutral-500" />
          </Button>
        </div>
      </div>

      <div className="mt-10">
        <div className="text-4xl font-semibold tracking-tight text-neutral-900">{title}</div>
        <p className="mt-4 max-w-[820px] text-base leading-7 text-neutral-600">{description}</p>
      </div>
    </div>
  );
}

/** Timeline: match the reference (light dots + line, big text, time on the right) */
function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="mt-12">
      <div className="text-sm font-medium text-neutral-400">Timeline</div>

      <div className="mt-6 space-y-10">
        {items.map((it, idx) => {
          const last = idx === items.length - 1;

          return (
            <div key={it.id} className="grid grid-cols-[28px_1fr_auto] items-start gap-x-6">
              <div className="relative flex justify-center">
                <span className="mt-[9px] h-2.5 w-2.5 rounded-full bg-neutral-300" />
                {!last ? (
                  <span className="absolute top-6 bottom-[-40px] h-[50px] w-px bg-neutral-200" />
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="text-[16px] font-medium leading-8 text-neutral-900">{it.text}</div>
              </div>

              <div className="pt-1 text-sm font-normal text-neutral-400">{it.at}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodoMark({ status }: { status: TodoStatus }) {
    // Outer border + small inset gap + inner fill (like the reference)
    return (
      <span
        className={cn(
          "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[6px] border bg-white p-[1.5px]",
          status === "pending"
            ? "border-neutral-300"
            : status === "in_progress"
            ? "border-sky-500"
            : "border-emerald-500"
        )}
      >
        <span
          className={cn(
            "grid h-full w-full place-items-center rounded-[4px]",
            status === "pending" && "bg-transparent",
            status === "in_progress" && "bg-sky-500",
            status === "completed" && "bg-emerald-500"
          )}
        >
         
        </span>
      </span>
    );
  }
  
  /** Todos: smaller + spinner on the far right of the row */
  function Todos({ items }: { items: TodoItem[] }) {
    return (
      <div className="mt-16">
<div className="flex flex-row items-center justify-between"><div className="text-sm font-medium text-neutral-400">Todos</div>
        <div className="text-sm font-medium text-neutral-400">
            <PlusIcon className="h-4 w-4" />
        </div>
      </div>  
        <div className="mt-5 space-y-5">
          {items.map((t) => {
            const status: TodoStatus = t.status ?? "pending";
  
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TodoMark status={status} />
  
                  <span
                    className={cn(
                      "truncate text-[16.5px] leading-6",
                      status === "completed"
                        ? "text-neutral-400 line-through"
                        : "text-neutral-900"
                    )}
                  >
                    {t.text}
                  </span>
                </div>
  
                {status === "in_progress" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }


export default function TaskReviewPage() {
  const router = useRouter();
  const runId = router.query.id as string | undefined;
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<any | null>(null);
  const [task, setTask] = React.useState<any | null>(null);
  const [events, setEvents] = React.useState<any[]>([]);
  const [todos, setTodos] = React.useState<TodoItem[]>([]);
  const [artifacts, setArtifacts] = React.useState<any[]>([]);
  const [comments, setComments] = React.useState<any[]>([]);
  const [fileOps, setFileOps] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [runRes, todosRes, artifactsRes, eventsRes, commentsRes, fileOpsRes] = await Promise.all([
          fetch(`/api/runs/${runId}`),
          fetch(`/api/todos?runId=${encodeURIComponent(runId)}`),
          fetch(`/api/artifacts?runId=${encodeURIComponent(runId)}`),
          fetch(`/api/runs/${runId}/events?limit=200`),
          fetch(`/api/comments?runId=${encodeURIComponent(runId)}`),
          fetch(`/api/runs/${runId}/file-ops`),
        ]);
        if (!runRes.ok) throw new Error(await runRes.text());
        const runData = await runRes.json();
        const runRow = runData?.run ?? null;
        if (!cancelled) setRun(runRow);

        if (runRow?.taskId) {
          const taskRes = await fetch(`/api/tasks/${runRow.taskId}`);
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            if (!cancelled) setTask(taskData?.task ?? null);
          }
        }

        if (todosRes.ok) {
          const todoData = await todosRes.json();
          const list = Array.isArray(todoData?.todos) ? todoData.todos : [];
          if (!cancelled)
            setTodos(
              list.map((t: any) => ({
                id: String(t.id),
                text: String(t.text ?? ""),
                status: t.status as TodoStatus,
              }))
            );
        }

        if (artifactsRes.ok) {
          const artifactData = await artifactsRes.json();
          if (!cancelled) setArtifacts(Array.isArray(artifactData?.artifacts) ? artifactData.artifacts : []);
        }

        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          if (!cancelled) setEvents(Array.isArray(eventsData?.events) ? eventsData.events : []);
        }

        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          if (!cancelled) setComments(Array.isArray(commentsData?.comments) ? commentsData.comments : []);
        }

        if (fileOpsRes.ok) {
          const fileOpsData = await fileOpsRes.json();
          if (!cancelled) setFileOps(Array.isArray(fileOpsData?.fileOps) ? fileOpsData.fileOps : []);
        }
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message ?? "Failed to load run"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const title = task?.title ?? run?.title ?? "Run";
  const description = task?.description ?? run?.description ?? "";

  const timeline: TimelineItem[] = React.useMemo(() => {
    const rows = events.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return rows.map((e: any) => ({
      id: String(e.id ?? e.seq ?? Math.random()),
      text: String(e.action ?? e.type ?? "event"),
      at: new Date(e.createdAt).toLocaleString(),
    }));
  }, [events]);

  const deliverables: Deliverable[] = React.useMemo(() => {
    return artifacts.map((a: any) => {
      const type = String(a.type ?? "file");
      const title = String(a.title ?? "Artifact");
      if (type === "email") {
        return { kind: "email", subject: title, body: "" };
      }
      if (type === "spreadsheet") {
        return {
          kind: "sheet",
          title,
          meta: "Created",
          columns: [],
          rows: [],
          summary: { dataNotes: [] },
        };
      }
      if (type === "document") {
        return {
          kind: "doc",
          title,
          docTitle: title,
          createdLabel: "Generated",
          sections: [],
        };
      }
      if (type === "patch") {
        return {
          kind: "code_change",
          title,
          hunks: [],
        };
      }
      return {
        kind: "file_edited",
        title,
        meta: "Created",
        changes: [],
      };
    });
  }, [artifacts]);

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-[1100px] px-10">
        {loading ? (
          <div className="pt-10 text-sm text-neutral-400">Loading run…</div>
        ) : error ? (
          <div className="pt-10 text-sm text-red-500">{error}</div>
        ) : (
          <>
            <PageHeader title={title} description={description} updatedLabel={new Date().toLocaleString()} />
            <Timeline items={timeline} />
            <Todos items={todos} />
            <Deliverables items={deliverables} />
            <div className="mt-16">
              <div className="text-sm font-medium text-neutral-400">Comments</div>
              <div className="mt-5 space-y-4">
                {comments.length ? (
                  comments.map((c: any) => (
                    <div key={c.id} className="rounded-lg border border-neutral-100 p-3 text-sm text-neutral-700">
                      <div className="text-xs text-neutral-400">
                        {new Date(c.createdAt).toLocaleString()} · {c.targetType}
                      </div>
                      <div className="mt-1">{c.body}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-neutral-400">No comments yet.</div>
                )}
              </div>
            </div>
            <div className="mt-16">
              <div className="text-sm font-medium text-neutral-400">File Ops</div>
              <div className="mt-5 space-y-3">
                {fileOps.length ? (
                  fileOps.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between text-sm text-neutral-700">
                      <div className="truncate">
                        <span className="font-medium">{f.op}</span> {f.path}
                      </div>
                      <div className="text-xs text-neutral-400">{new Date(f.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-neutral-400">No file operations yet.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}