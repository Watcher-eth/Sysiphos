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
  Share2,
  SheetIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Deliverable, Deliverables } from "@/components/review/deliverables";

type TaskStatus = "review" | "success" | "in_progress" | "error";
type StepStatus = "done" | "pending_review" | "running" | "todo" | "error";
type TodoStatus = "not_started" | "in_progress" | "done";

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



type TaskReviewModel = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  updatedLabel: string; // "Updated 49 minutes ago"
  timeline: TimelineItem[];
  todos: TodoItem[];
  deliverables: Deliverable[];
};

const demoTask1: TaskReviewModel = {
  id: "2049",
  title: "Week Kickoff",
  description:
    "Strong MRR growth of 13–18% month-over-month with successful free tier discontinuation. Three-month strategy focuses on user reactivation, product launch, and establishing sustainable growth channels.",
  status: "review",
  updatedLabel: "Updated 49 minutes ago",
  timeline: [
    {
      id: "t1",
      text: "MRR growth reaches 12.5% ($1.3M) despite forex impact",
      at: "Mar 24, 16:45",
      status: "done",
    },
    {
      id: "t2",
      text: "Decision to phase out Personal plan and potentially Pro plan to focus on Business-only model",
      at: "Mar 24, 16:45",
      status: "done",
    },
    {
      id: "t3",
      text: "Weekly metrics show growing signups with 7.5% conversion rate",
      at: "Mar 17, 17:00",
      status: "done",
    },
    {
      id: "t4",
      text: "AI feature retention data: AI notes users retain at 66%, AI chat users at 92%",
      at: "Mar 17, 17:00",
      status: "done",
    },
    {
      id: "t5",
      text: "People Briefings feature finalized for rollout with phased launch strategy",
      at: "Mar 10, 17:00",
      status: "pending_review",
    },
    {
      id: "t6",
      text: "Current MRR reaches 1.15M EUR with 2% growth in March",
      at: "Mar 3, 16:45",
      status: "todo",
    },
  ],
  todos: [
    { id: "td1", text: "Order door hardware" , status: "not_started" },
    { id: "td2", text: "Seal floor" , status: "in_progress" },
    { id: "td3", text: "Tile test", status: "done" },
    { id: "td4", text: "Wrap up last month bookkeeping" , status: "not_started" },
    { id: "td5", text: "Book Berlin flight" , status: "not_started" },
  ],
  deliverables: [
    {
      kind: "email",
      title: "Email",
      meta: "Send email",
      to: "team@amie.so",
      subject: "product tier changes - important update",
      body: "hey team\n\nwanted to share...\n\nthanks",
    },
    {
      kind: "doc",
      title: "Q3 Competitive Analysis",
      meta: "Created",
      previewTitle: "Executive Summary",
      preview: "Q3 marked a significant shift...",
      onOpen: () => {},
    },
    {
      kind: "sheet",
      title: "Pipeline Forecast",
      meta: "Edited",
      previewTitle: "Notes",
      preview: "Updated assumptions for conversion and churn...",
      onOpen: () => {},
    },
    {
      kind: "file_change",
      title: "File changes",
      meta: "Edits",
      summary: "Updated pricing copy and fixed layout regressions.",
      diff: { plus: 24, minus: 11 },
      files: [
        { path: "src/app/pricing/page.tsx", note: "Copy + spacing" },
        { path: "src/components/task-review/deliverables.tsx" },
      ],
      onOpen: () => {},
    },
    {
      kind: "file",
      title: "Competitor_Analysis_Q3.pdf",
      meta: "Generated report",
      size: "1.2 MB",
      href: "/demo.pdf",
      fileType: "pdf",
    },
  ],

  };


// --- example deliverables data (update demoTask.deliverables) ---



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
                  <span className="absolute top-6 bottom-[-40px] w-px bg-neutral-200" />
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
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border bg-white p-[1.5px]",
          status === "not_started" ? "border-neutral-300" : status === "in_progress" ? "border-sky-500" : "border-emerald-500"
        )}
      >
        <span
          className={cn(
            "grid h-full w-full place-items-center rounded-[4px]",
            status === "not_started" && "bg-transparent",
            status === "in_progress" && "bg-sky-500",
            status === "done" && "bg-emerald-500"
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
        <div className="text-sm font-medium text-neutral-400">Todos</div>
  
        <div className="mt-5 space-y-3">
          {items.map((t) => {
            const status: TodoStatus = t.status ?? "not_started";
  
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TodoMark status={status} />
  
                  <span
                    className={cn(
                      "truncate text-[15px] leading-6",
                      status === "done"
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
  const _id = (router.query.id as string) || demoTask.id;

  // wire to real task by id later; for now demo
  const task = demoTask;

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-[1100px] px-10">
        <PageHeader title={task.title} description={task.description} updatedLabel={task.updatedLabel} />

        {/* Flat sections (no cards for timeline/todos) */}
        <Timeline items={task.timeline} />
        <Todos items={task.todos} />

        {/* Deliverables can be bordered like the Actions/email area in the reference */}
        <Deliverables items={task.deliverables} />
      </div>
    </div>
  );
}