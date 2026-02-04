"use client";

import * as React from "react";
import {
  X,
  Mail,
  FileText,
  Sheet as SheetIcon,
  Code,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

/* ───────────────────────── Types ───────────────────────── */

export type Deliverable =
  | EmailDeliverable
  | DocDeliverable
  | SheetDeliverable
  | FileChangeDeliverable;

export type EmailDeliverable = {
  kind: "email";
  title?: string; // default "Email"
  headerAction?: string; // default "Send email"
  to?: string;
  subject?: string;
  body?: string;
  onClose?: () => void;
};

export type DocDeliverable = {
  kind: "doc";
  title: string;
  headerAction?: string; // "Open"
  meta?: string; // "Created" / "Edited"
  previewTitle?: string;
  previewText?: string;
  previewImageUrl?: string; // if you have a real screenshot/thumbnail
  onOpen?: () => void;
  onClose?: () => void;
};

export type SheetDeliverable = {
  kind: "sheet";
  title: string;
  headerAction?: string; // "Open sheet"
  meta?: string; // "Created" / "Edited"
  columns: string[];
  rows: Array<Array<string | number>>;
  onOpen?: () => void;
  onClose?: () => void;
};

export type FileChangeDeliverable = {
  kind: "file_change";
  title: string; // e.g. "ComparePageClient.tsx"
  headerAction?: string; // "View changes"
  meta?: string; // e.g. "Edited"
  language?: string; // optional label
  hunks: Array<{
    header?: string; // e.g. "@@ -12,6 +12,9 @@"
    lines: Array<
      | { type: "add"; text: string }
      | { type: "del"; text: string }
      | { type: "ctx"; text: string }
    >;
  }>;
  onOpen?: () => void;
  onClose?: () => void;
};

/* ───────────────────────── Styling helpers ───────────────────────── */

type HeaderStyle = {
  icon: React.ReactNode;
  iconBoxClass: string; // small rounded rectangle background
  label: string; // left header text
};

function headerStyleFor(d: Deliverable): HeaderStyle {
  switch (d.kind) {
    case "email":
      return {
        icon: <Mail className="h-3.5 w-3.5 text-sky-600" />,
        iconBoxClass: "bg-sky-50 ring-1 ring-sky-100",
        label: d.title ?? "Email",
      };
    case "doc":
      return {
        icon: <FileText className="h-3.5 w-3.5 text-violet-600" />,
        iconBoxClass: "bg-violet-50 ring-1 ring-violet-100",
        label: "Document",
      };
    case "sheet":
      return {
        icon: <SheetIcon className="h-3.5 w-3.5 text-emerald-600" />,
        iconBoxClass: "bg-emerald-50 ring-1 ring-emerald-100",
        label: "Spreadsheet",
      };
    case "file_change":
      return {
        icon: <Code className="h-3.5 w-3.5 text-orange-600" />,
        iconBoxClass: "bg-orange-50 ring-1 ring-orange-100",
        label: "Changes",
      };
  }
}

function ActionCardShell({
  deliverable,
  headerRight,
  children,
}: {
  deliverable: Deliverable;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hs = headerStyleFor(deliverable);
  const onClose = (deliverable as any).onClose as undefined | (() => void);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* header (match reference: light gray, small icon box, subtle borders) */}
      <div className="flex items-center justify-between bg-neutral-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-[6px]",
              hs.iconBoxClass
            )}
          >
            {hs.icon}
          </span>
          <div className="text-[13px] font-medium text-neutral-800">
            {hs.label}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[13px] text-neutral-400">
          {headerRight}
          <Separator orientation="vertical" className="h-4 bg-neutral-200" />
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Separator className="bg-neutral-200" />
      {children}
    </div>
  );
}

/* ───────────────────────── Email ───────────────────────── */

function KeyValueRow({
  k,
  v,
}: {
  k: string;
  v?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[86px_1fr] items-center px-4 py-3">
      <div className="text-[13px] text-neutral-500">{k}</div>
      <div className="min-w-0 text-[14px] text-neutral-900">{v ?? "—"}</div>
    </div>
  );
}

function EmailCard({ d }: { d: EmailDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={<span className="tabular-nums">{d.headerAction ?? "Send email"}</span>}
    >
      <div>
        <KeyValueRow k="To" v={d.to} />
        <Separator className="bg-neutral-200" />
        <KeyValueRow k="Subject" v={d.subject} />
        <Separator className="bg-neutral-200" />
        <div className="px-4 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-6 text-neutral-900">
            {d.body ?? ""}
          </pre>
        </div>
      </div>
    </ActionCardShell>
  );
}

/* ───────────────────────── Doc ───────────────────────── */

function DocPreview({
  previewImageUrl,
  previewTitle,
  previewText,
}: {
  previewImageUrl?: string;
  previewTitle?: string;
  previewText?: string;
}) {
  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-[140px_1fr] gap-4">
        {/* left thumbnail */}
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {previewImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewImageUrl}
              alt="Document preview"
              className="h-[180px] w-full object-cover"
            />
          ) : (
            // clean “first page” skeleton
            <div className="h-[180px] w-full bg-white p-3">
              <div className="h-3 w-10/12 rounded bg-neutral-200" />
              <div className="mt-3 space-y-2">
                <div className="h-2.5 w-full rounded bg-neutral-100" />
                <div className="h-2.5 w-11/12 rounded bg-neutral-100" />
                <div className="h-2.5 w-10/12 rounded bg-neutral-100" />
                <div className="h-2.5 w-9/12 rounded bg-neutral-100" />
                <div className="h-2.5 w-11/12 rounded bg-neutral-100" />
                <div className="h-2.5 w-8/12 rounded bg-neutral-100" />
              </div>
            </div>
          )}
        </div>

        {/* right text */}
        <div className="min-w-0">
          {previewTitle ? (
            <div className="text-[14px] font-medium text-neutral-900">
              {previewTitle}
            </div>
          ) : null}
          {previewText ? (
            <div className={cn("text-[14px] leading-6 text-neutral-700", previewTitle ? "mt-2" : "")}>
              {previewText}
            </div>
          ) : (
            <div className="text-[14px] leading-6 text-neutral-500">
              Preview unavailable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocCard({ d }: { d: DocDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={
        <button
          type="button"
          onClick={d.onOpen}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-neutral-500 hover:bg-neutral-100"
        >
          {d.headerAction ?? "Open"}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="px-4 py-3">
        <div className="text-[14px] font-medium text-neutral-900 truncate">
          {d.title}
        </div>
        {d.meta ? (
          <div className="mt-1 text-[13px] text-neutral-500">{d.meta}</div>
        ) : null}
      </div>
      <Separator className="bg-neutral-200" />
      <DocPreview
        previewImageUrl={d.previewImageUrl}
        previewTitle={d.previewTitle}
        previewText={d.previewText}
      />
    </ActionCardShell>
  );
}

/* ───────────────────────── Sheet ───────────────────────── */

function SheetPreview({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  const maxRows = 6;
  const shown = rows.slice(0, maxRows);

  return (
    <div className="px-4 py-4">
      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="truncate border-b border-neutral-200 px-3 py-2 text-left text-[12px] font-medium text-neutral-600"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-b-0">
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="truncate px-3 py-2 text-[13px] text-neutral-800"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > maxRows ? (
        <div className="mt-2 text-[12px] text-neutral-400">
          Showing {maxRows} of {rows.length} rows
        </div>
      ) : null}
    </div>
  );
}

function SheetCard({ d }: { d: SheetDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={
        <button
          type="button"
          onClick={d.onOpen}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-neutral-500 hover:bg-neutral-100"
        >
          {d.headerAction ?? "Open sheet"}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="px-4 py-3">
        <div className="truncate text-[14px] font-medium text-neutral-900">
          {d.title}
        </div>
        {d.meta ? (
          <div className="mt-1 text-[13px] text-neutral-500">{d.meta}</div>
        ) : null}
      </div>
      <Separator className="bg-neutral-200" />
      <SheetPreview columns={d.columns} rows={d.rows} />
    </ActionCardShell>
  );
}

/* ───────────────────────── File change ───────────────────────── */

function DiffPreview({ hunks }: { hunks: FileChangeDeliverable["hunks"] }) {
  const maxLines = 14;

  const flattened: Array<{ type: "add" | "del" | "ctx"; text: string }> = [];
  for (const h of hunks) {
    if (h.header) flattened.push({ type: "ctx", text: h.header });
    for (const l of h.lines) flattened.push(l);
  }
  const shown = flattened.slice(0, maxLines);

  return (
    <div className="px-4 py-4">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="bg-neutral-50 px-3 py-2 text-[12px] font-medium text-neutral-600">
          Diff preview
        </div>
        <div className="font-mono text-[12px] leading-5">
          {shown.map((l, idx) => {
            const prefix = l.type === "add" ? "+" : l.type === "del" ? "-" : " ";
            return (
              <div
                key={idx}
                className={cn(
                  "flex gap-2 px-3 py-1",
                  l.type === "add" && "bg-emerald-50",
                  l.type === "del" && "bg-rose-50"
                )}
              >
                <span
                  className={cn(
                    "w-3 shrink-0 text-center",
                    l.type === "add" && "text-emerald-600",
                    l.type === "del" && "text-rose-600",
                    l.type === "ctx" && "text-neutral-400"
                  )}
                >
                  {prefix}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", l.type === "ctx" ? "text-neutral-500" : "text-neutral-800")}>
                  {l.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {flattened.length > maxLines ? (
        <div className="mt-2 text-[12px] text-neutral-400">
          Showing {maxLines} of {flattened.length} lines
        </div>
      ) : null}
    </div>
  );
}

function FileChangeCard({ d }: { d: FileChangeDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={
        <button
          type="button"
          onClick={d.onOpen}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-neutral-500 hover:bg-neutral-100"
        >
          {d.headerAction ?? "View changes"}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="truncate text-[14px] font-medium text-neutral-900">
            {d.title}
          </div>
          {d.language ? (
            <div className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-500">
              {d.language}
            </div>
          ) : null}
        </div>
        {d.meta ? (
          <div className="mt-1 text-[13px] text-neutral-500">{d.meta}</div>
        ) : null}
      </div>
      <Separator className="bg-neutral-200" />
      <DiffPreview hunks={d.hunks} />
    </ActionCardShell>
  );
}

/* ───────────────────────── Public component ───────────────────────── */

export function Deliverables({ items }: { items: Deliverable[] }) {
  return (
    <div className="mt-16 pb-24">
      <div className="text-sm font-medium text-neutral-400">Actions</div>

      <div className="mt-6 space-y-6">
        {items.map((d, idx) => {
          if (d.kind === "email") return <EmailCard key={idx} d={d} />;
          if (d.kind === "doc") return <DocCard key={idx} d={d} />;
          if (d.kind === "sheet") return <SheetCard key={idx} d={d} />;
          return <FileChangeCard key={idx} d={d} />;
        })}
      </div>
    </div>
  );
}