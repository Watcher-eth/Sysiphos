"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Plus,
  Bell,
  RotateCcw,
  Clock,
  Inbox,
  Loader2,
  GitPullRequestArrow,
  AlertCircle,
  Check,
} from "lucide-react";

type Status = "open" | "in_progress" | "review" | "success" | "error";

type Subtask = {
  id: string;
  title: string;
  done?: boolean;
  dueLabel?: string;
};

type Task = {
  id: string;
  title: string;
  dueLabel?: string;
  pinned?: boolean;
  recurring?: boolean;
  subtasks?: Subtask[];

  // re-added (right-side task meta)
  status?: Status;
  activity?: string;
  diff?: { plus: number; minus: number };
};

type Group = {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent?: "neutral" | "orange";
  tasks: Task[];
};

const GROUPS: Group[] = [
  {
    id: "inbox",
    title: "Inbox",
    icon: <Inbox className="h-4 w-4 text-neutral-400" />,
    accent: "neutral",
    tasks: [
      {
        id: "t1",
        title: "Make friends",
        dueLabel: "Jan 08, 1:45 PM",
        pinned: true,
        recurring: true,
        status: "in_progress",
        activity: "Reading og-image-generator.js",
        diff: { plus: 1, minus: 1 },
        subtasks: [
          { id: "s1", title: "Wake up!", done: true, dueLabel: "Jan 09, 1 PM" },
          { id: "s2", title: "To be upgraded", done: true, dueLabel: "Jan 10, 1:15 PM" },
        ],
      },
    ],
  },
  {
    id: "today",
    title: "Today",
    icon: <Clock className="h-4 w-4 text-neutral-400" />,
    accent: "neutral",
    tasks: [
      {
        id: "t2",
        title: "Make friends",
        dueLabel: "Jan 08, 1:45 PM",
        pinned: true,
        recurring: true,
        status: "review",
        activity: "PR ready for review",
        diff: { plus: 12, minus: 4 },
        subtasks: [
          { id: "s3", title: "Wake up!", done: true, dueLabel: "Jan 09, 1 PM" },
          { id: "s4", title: "To be upgraded", done: true, dueLabel: "Jan 10, 1:15 PM" },
        ],
      },
    ],
  },
  {
    id: "no-termination",
    title: "No termination date",
    icon: <RotateCcw className="h-4 w-4 text-orange-500" />,
    accent: "orange",
    tasks: [
      {
        id: "t3",
        title: "Move in",
        status: "success",
        diff: { plus: 3, minus: 1 },
        subtasks: [
          { id: "s5", title: "Being so charming", done: true },
          { id: "s6", title: "Enhance", done: true },
        ],
      },
    ],
  },
];

/** ---------- tiny utils ---------- */

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function StatusLabel(status: Status) {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "review":
      return "Review";
    case "success":
      return "Done";
    case "error":
      return "Failed";
  }
}

function StatusDotClass(status: Status) {
  // very subtle tints
  switch (status) {
    case "open":
      return "bg-neutral-300";
    case "in_progress":
      return "bg-neutral-400";
    case "review":
      return "bg-amber-300";
    case "success":
      return "bg-emerald-300";
    case "error":
      return "bg-rose-300";
  }
}

/** ---------- top pills ---------- */

function Pill({
  active,
  label,
  count,
  onClick,
}: {
  active?: boolean;
  label: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium",
        active
          ? "bg-neutral-100 text-neutral-900"
          : "bg-transparent text-neutral-500 hover:text-neutral-700"
      )}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className="text-neutral-400">{count}</span>
      ) : null}
    </button>
  );
}

/** ---------- left controls ---------- */

function CheckboxDot({ checked }: { checked?: boolean }) {
  return (
    <span
      className={cn(
        "mt-[2px] inline-flex h-[18px] w-[18px] shrink-0 rounded-full ring-1",
        checked ? "bg-neutral-900 ring-neutral-900" : "bg-white ring-neutral-300"
      )}
    />
  );
}

function SubtaskCheck({ done }: { done?: boolean }) {
  return (
    <span className="mt-[2px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      {done ? <span className="text-neutral-400">✓</span> : null}
    </span>
  );
}

/** ---------- right meta (re-added) ---------- */

function Diff({ diff }: { diff: { plus: number; minus: number } }) {
  return (
    <div className="flex items-center gap-2 text-[13px] tabular-nums text-neutral-500">
      <span className="text-emerald-600">+{diff.plus}</span>
      <span className="text-rose-600">-{diff.minus}</span>
    </div>
  );
}

function MiniStatus({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-1.5 w-1.5 rounded-full", StatusDotClass(status))} />
      <span className="text-[13px] text-neutral-500">{StatusLabel(status)}</span>

      {status === "in_progress" ? (
        <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-neutral-400" />
      ) : null}
      {status === "review" ? (
        <GitPullRequestArrow className="ml-1 h-3.5 w-3.5 text-neutral-400" />
      ) : null}
      {status === "error" ? (
        <AlertCircle className="ml-1 h-3.5 w-3.5 text-neutral-400" />
      ) : null}
      {status === "success" ? (
        <Check className="ml-1 h-3.5 w-3.5 text-neutral-400" />
      ) : null}
    </span>
  );
}

function TaskRight({
  status,
  activity,
  diff,
}: {
  status?: Status;
  activity?: string;
  diff?: { plus: number; minus: number };
}) {
  const show = !!status || !!diff || !!activity;
  if (!show) return null;

  return (
    <div className="ml-6 flex shrink-0 items-center gap-4">
      <div className="hidden max-w-[320px] truncate text-[13px] text-neutral-400 md:block">
        {activity ?? ""}
      </div>

      {diff ? <Diff diff={diff} /> : <div className="hidden md:block w-[54px]" />}

      {status ? <MiniStatus status={status} /> : null}
    </div>
  );
}

/** ---------- header ---------- */

function GroupHeader({
  icon,
  title,
  count,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  accent?: "neutral" | "orange";
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-6 w-6 place-items-center">{icon}</div>
        <div className="flex items-center gap-2">
          <div className={cn("text-[13px] font-semibold text-neutral-900")}>{title}</div>
          <div className="text-[13px] text-neutral-400">{count}</div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-neutral-400">
        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100">
          <Plus className="h-4 w-4" />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RowRightMeta({
  dueLabel,
  pinned,
  recurring,
}: {
  dueLabel?: string;
  pinned?: boolean;
  recurring?: boolean;
}) {
  return (
    <div className="ml-6 flex shrink-0 items-center gap-2 text-[12px] text-neutral-400">
      {pinned ? <Bell className="h-4 w-4" /> : null}
      {dueLabel ? <span className="tabular-nums">{dueLabel}</span> : null}
      {recurring ? <RotateCcw className="h-4 w-4" /> : null}
    </div>
  );
}

/** ---------- row ---------- */

function TaskRow({ task }: { task: Task }) {
  const hasSub = (task.subtasks?.length ?? 0) > 0;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CheckboxDot checked={task.status === "success"} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-neutral-900">
              {task.title}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-5">
          <RowRightMeta
            dueLabel={task.dueLabel}
            pinned={task.pinned}
            recurring={task.recurring}
          />
          <TaskRight status={task.status} activity={task.activity} diff={task.diff} />
        </div>
      </div>

      {hasSub ? (
        <div className="mt-2 space-y-2 pl-[30px]">
          {task.subtasks!.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <SubtaskCheck done={s.done} />
                <div
                  className={cn(
                    "truncate text-[14px]",
                    s.done ? "text-neutral-400 line-through" : "text-neutral-700"
                  )}
                >
                  {s.title}
                </div>
              </div>

              {s.dueLabel ? (
                <div className="ml-6 shrink-0 text-[12px] text-neutral-400 tabular-nums">
                  {s.dueLabel}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* mobile-only right strip under row */}
      {(task.activity || task.status || task.diff) ? (
        <div className="mt-2 flex items-center justify-between pl-[30px] md:hidden">
          <div className="truncate text-[13px] text-neutral-400">{task.activity ?? ""}</div>
          <div className="ml-4 flex shrink-0 items-center gap-3">
            {task.diff ? <Diff diff={task.diff} /> : null}
            {task.status ? <MiniStatus status={task.status} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ---------- page ---------- */

export default function TasksPage() {
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "inbox" | "today" | "no-termination"
  >("all");

  const filters = [
    { key: "all" as const, label: "All", count: 2 },
    { key: "inbox" as const, label: "Inbox", count: 1 },
    { key: "today" as const, label: "Today", count: 1 },
    { key: "no-termination" as const, label: "No termination date", count: 1 },
  ];

  const visibleGroups =
    activeFilter === "all"
      ? GROUPS
      : GROUPS.filter((g) => g.id === activeFilter);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[1100px] px-10 pt-8 pb-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {filters.map((f) => (
              <Pill
                key={f.key}
                active={activeFilter === f.key}
                label={f.label}
                count={f.count}
                onClick={() => setActiveFilter(f.key)}
              />
            ))}
          </div>

          <button className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-8">
          {visibleGroups.map((g) => (
            <div key={g.id}>
              <GroupHeader
                icon={g.icon}
                title={g.title}
                count={g.tasks.length}
                accent={g.accent}
              />

              <div className="border-t border-neutral-100">
                {g.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="border-b border-neutral-100 last:border-b-0"
                  >
                    <TaskRow task={t} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-neutral-100 bg-white px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <button className="grid h-9 w-10 place-items-center rounded-xl hover:bg-neutral-100">
              <span className="text-neutral-500">⌕</span>
            </button>
            <div className="h-6 w-px bg-neutral-100" />
            <button className="grid h-9 w-10 place-items-center rounded-xl hover:bg-neutral-100">
              <span className="text-neutral-500">▢</span>
            </button>
            <button className="grid h-9 w-10 place-items-center rounded-xl hover:bg-neutral-100">
              <span className="text-neutral-500">⚙</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}