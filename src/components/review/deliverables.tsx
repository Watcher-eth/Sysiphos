"use client";

import * as React from "react";
import {
  X,
  Mail,
  FileText,
  Sheet as SheetIcon,
  FileDiff,
  Code,
  ExternalLink,
  PlusIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

/* ───────────────────────── Types ───────────────────────── */

export type Deliverable =
  | EmailDeliverable
  | DocDeliverable
  | SheetDeliverable
  | FileEditedDeliverable
  | CodeChangeDeliverable;

export type BaseDeliverable = {
  onClose?: () => void;
};

export type EmailDeliverable = BaseDeliverable & {
  kind: "email";
  headerLabel?: string; // default "Email"
  headerAction?: string; // default "Send email"
  to?: string;
  subject?: string;
  body?: string;
};



export type SheetChangeSummary = {
  rowsAdded?: number;
  rowsEdited?: number;
  rowsDeleted?: number;
  formulasAdded?: number;
  formulasEdited?: number;
  formulasDeleted?: number;
  dataNotes?: string[]; // e.g. "Used March CRM export", "Normalized currency columns"
};

export type SheetDeliverable = BaseDeliverable & {
  kind: "sheet";
  headerLabel?: string; // default "Spreadsheet"
  headerAction?: string; // default "Open sheet"
  title: string;
  meta?: string; // "Created" / "Edited"
  summary?: SheetChangeSummary;
  columns: string[];
  rows: Array<Array<string | number>>;
  onOpen?: () => void;
};

export type FileEditedDeliverable = BaseDeliverable & {
    kind: "file_edited";
    headerLabel?: string; // default "File"
    headerAction?: string; // default "Open"
    title: string; // e.g. "Brand_Guidelines.pdf"
    meta?: string; // "Edited" / "Updated"
    fileType?: "pdf" | "doc" | "image" | "other";
    changeSummary?: string; // one-liner
    changes: string[]; // bullets describing edits
  
    // Reuse the SAME document preview component for before/after.
    beforeDoc?: DocDeliverable;
    afterDoc?: DocDeliverable;
  
    onOpen?: () => void;
  };

export type CodeChangeDeliverable = BaseDeliverable & {
  kind: "code_change";
  headerLabel?: string; // default "Changes"
  headerAction?: string; // default "View changes"
  title: string; // e.g. "src/app/pricing/page.tsx"
  meta?: string;
  language?: string;
  hunks: Array<{
    header?: string;
    lines: Array<
      | { type: "add"; text: string }
      | { type: "del"; text: string }
      | { type: "ctx"; text: string }
    >;
  }>;
  onOpen?: () => void;
};

/* ───────────────────────── Card shell (Amie-like) ───────────────────────── */

type HeaderStyle = {
  icon: React.ReactNode;
  iconBoxClass: string; // small rounded-rect background
  label: string;
};

function headerStyleFor(d: Deliverable): HeaderStyle {
  switch (d.kind) {
    case "email":
      return {
        icon: <Mail className="h-3.5 w-3.5 text-white" />,
        iconBoxClass: "bg-[#2892F7] ",
        label: d.headerLabel ?? "Email",
      };
    case "doc":
      return {
        icon: <FileText className="h-3.5 w-3.5 text-white" />,
        iconBoxClass: "bg-[#F068DC] ",
        label: d.title ?? "Document",
      };
    case "sheet":
      return {
        icon: <SheetIcon className="h-3.5 w-3.5 text-white" />,
        iconBoxClass: "bg-[#2ED87D] ",
        label: d.title ?? "Spreadsheet",
      };
    case "file_edited":
      return {
        icon: <FileDiff className="h-3.5 w-3.5 text-white" />,
        iconBoxClass: "bg-[#E24248] ",
        label: d.title ?? "File",
      };
    case "code_change":
      return {
        icon: <Code className="h-3.5 w-3.5 text-neutral-700" />,
        iconBoxClass: "bg-[#FFE248] ",
        label: d.headerLabel ?? "Changes",
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
  const onClose = deliverable.onClose;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* header: light gray, subtle, single border */}
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

        <div className="flex items-center gap-2 text-[13px] text-neutral-400">
          {headerRight}
          <span className="mx-1 text-neutral-300">|</span>
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-neutral-500" />
          </button>
        </div>
      </div>

      {/* single divider (avoid stacked separators) */}
      <div className="h-px w-full bg-neutral-200" />
      {children}
    </div>
  );
}

/* ───────────────────────── Shared small primitives ───────────────────────── */

function KVRow({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_1fr] items-center px-4 py-3">
      <div className="text-[13px] text-neutral-500">{k}</div>
      <div className="min-w-0 text-[14px] text-neutral-900">{v ?? "—"}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-neutral-200" />;
}

function HeaderLinkButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </button>
  );
}

/* ───────────────────────── Email ───────────────────────── */

function EmailCard({ d }: { d: EmailDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={<span className="tabular-nums">{d.headerAction ?? "Send email"}</span>}
    >
      <div>
        <KVRow k="To" v={d.to} />
        <Divider />
        <KVRow k="Subject" v={d.subject} />
        <Divider />
        <div className="px-4 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-6 text-neutral-900">
            {d.body ?? ""}
          </pre>
        </div>
      </div>
    </ActionCardShell>
  );
}

/* ───────────────────────── Document preview (formatted page) ───────────────────────── */

/* ───────────────────────── Document (REWORKED 1:1) ───────────────────────── */

export type DocSource =
  | { type: "file"; label: string } // e.g. "notes.md"
  | { type: "link"; label: string }; // e.g. "Productboard"

export type DocInline =
  | { t: "text"; v: string }
  | { t: "add"; v: string } // added text
  | { t: "del"; v: string }; // removed text

export type DocParagraph = {
  kind: "p";
  inlines: DocInline[];
};

export type DocHeading = {
  kind: "h2";
  text: string;
};

export type DocBullets = {
  kind: "bullets";
  items: DocInline[][];
};

export type DocSection = DocHeading | DocParagraph | DocBullets;

export type DocDeliverable = BaseDeliverable & {
  kind: "doc";
  headerLabel?: string; // default "Document"
  headerAction?: string; // default "Open"
  title: string; // card title line
  onOpen?: () => void;

  // Preview meta (matches reference)
  docTitle: string; // big title in preview
  createdLabel: string; // "Mon, 10 Feb, 17:45 → 18:12"
  sourcesLabel?: string; // "notes.md, CRM export, ..."

  // Content (summary transcript-like)
  sections: DocSection[];

  // optional: show edit mode (adds highlighting)
  mode?: "view" | "edit";
};

function DocTabs({
  active = "Summary",
}: {
  active?: "Private notes" | "Summary" | "Transcript";
}) {
  const Tab = ({
    label,
    isActive,
  }: {
    label: "Private notes" | "Summary" | "Transcript";
    isActive: boolean;
  }) => (
    <button
      type="button"
      className={cn(
        "relative px-1 py-2 text-[14px] font-medium",
        isActive ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
      )}
    >
      {label}
      {isActive ? (
        <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-neutral-900" />
      ) : null}
    </button>
  );

  return (
    <div className="flex gap-8 border-b border-neutral-200 px-4">
      <Tab label="Private notes" isActive={active === "Private notes"} />
      <Tab label="Summary" isActive={active === "Summary"} />
      <Tab label="Transcript" isActive={active === "Transcript"} />
    </div>
  );
}

function DocToolbar() {
  // simple text controls like the reference row: English / General / Copy summary
  const Chip = ({ label }: { label: string }) => (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-[14px] text-neutral-500 hover:text-neutral-700"
    >
      <span className="text-neutral-400">⟂</span>
      <span>{label}</span>
      <span className="text-neutral-300">▾</span>
    </button>
  );

  return (
    <div className="flex items-center gap-8 px-4 py-3 text-[14px]">
      <Chip label="English" />
      <Chip label="General" />
      <button
        type="button"
        className="inline-flex items-center gap-2 text-[14px] text-neutral-500 hover:text-neutral-700"
      >
        <span className="text-neutral-400">⧉</span>
        Copy summary
      </button>
    </div>
  );
}

function InlineRun({
  inlines,
  mode,
}: {
  inlines: DocInline[];
  mode: "view" | "edit";
}) {
  return (
    <>
      {inlines.map((x, i) => {
        if (x.t === "text") return <React.Fragment key={i}>{x.v}</React.Fragment>;

        // EDIT highlighting (doc-style, subtle)
        if (x.t === "add") {
          return (
            <span
              key={i}
              className={cn(
                mode === "edit" && "bg-emerald-50 text-neutral-900",
                "rounded-sm px-1"
              )}
            >
              {x.v}
            </span>
          );
        }

        return (
          <span
            key={i}
            className={cn(
              mode === "edit" && "bg-rose-50 text-neutral-700 line-through",
              "rounded-sm px-1"
            )}
          >
            {x.v}
          </span>
        );
      })}
    </>
  );
}

function EditGutter({
    hasAdd,
    hasDel,
    mode,
  }: {
    hasAdd: boolean;
    hasDel: boolean;
    mode: "view" | "edit";
  }) {
    // keep alignment stable even when not editing
    if (mode !== "edit") return <div className="w-[6px] shrink-0" />;
  
    const color =
      hasAdd ? "bg-emerald-500" : hasDel ? "bg-rose-500" : "bg-transparent";
  
    return (
      <div className="w-[6px] shrink-0 flex justify-center">
        <div className={`w-[3.5px] self-stretch rounded-full ${color}`} />
      </div>
    );
  }

function DocBody({ d }: { d: DocDeliverable }) {
  const mode = d.mode ?? "view";

  return (
    <div className="px-4 pb-6 pt-2">
      {/* Section Title + Subheading like reference */}
      {/* You can model these as real sections too; keeping fixed styling here */}
      <div className="mt-3 text-[22px] font-semibold tracking-tight text-neutral-900">
        Growth and Development Update
      </div>
      <div className="mt-2 text-[16px] font-semibold text-neutral-900">
        Growth Metrics and Performance
      </div>

      <div className="mt-4 space-y-5 text-[16px] leading-7 text-neutral-800">
        {d.sections.map((s, idx) => {
          if (s.kind === "h2") {
            return (
              <div key={idx} className="pt-2 text-[16px] font-semibold text-neutral-900">
                {s.text}
              </div>
            );
          }

          if (s.kind === "p") {
            const hasAdd = s.inlines.some((x) => x.t === "add");
            const hasDel = s.inlines.some((x) => x.t === "del");
            return (
              <div key={idx} className="flex gap-3">
                <EditGutter hasAdd={hasAdd} hasDel={hasDel} mode={mode} />
                <p className="min-w-0 flex-1">
                  <InlineRun inlines={s.inlines} mode={mode} />
                </p>
              </div>
            );
          }

          // bullets
          return (
            <ul key={idx} className="space-y-4">
              {s.items.map((item, j) => {
                const hasAdd = item.some((x) => x.t === "add");
                const hasDel = item.some((x) => x.t === "del");
                return (
                  <li key={j} className="flex gap-3">
                    <EditGutter hasAdd={hasAdd} hasDel={hasDel} mode={mode} />
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
                      <span className="min-w-0 flex-1">
                        <InlineRun inlines={item} mode={mode} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
    </div>
  );
}

function DocPreview({ d }: { d: DocDeliverable }) {
  return (
    <div>
      {/* Big bold title */}
      <div className="px-4 pt-6">
        <div className="text-[40px] font-semibold tracking-tight text-neutral-900">
          {d.docTitle}
        </div>

        {/* Created + Sources rows */}
        <div className="mt-8 space-y-3 text-[16px] text-neutral-500">
          <div className="grid grid-cols-[120px_1fr] gap-6">
            <div className="text-neutral-400">Created</div>
            <div className="text-neutral-600">{d.createdLabel}</div>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-6">
            <div className="text-neutral-400">Sources</div>
            <div className="text-neutral-600">
              {d.sourcesLabel ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* single separator like reference */}
      <div className="mt-8 h-px w-full bg-neutral-200" />

      {/* tabs */}
      <DocTabs active="Summary" />

      {/* toolbar */}
      <DocToolbar />

      {/* body */}
      <DocBody d={d} />
    </div>
  );
}

function DocCard({ d }: { d: DocDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={<HeaderLinkButton label={d.headerAction ?? "Open"} onClick={d.onOpen} />}
    >
 
      {/* Single divider from shell already exists; don’t add extra */}
      <DocPreview d={d} />
    </ActionCardShell>
  );
}

/* ───────────────────────── Spreadsheet ───────────────────────── */



function SheetTablePreview({
    columns,
    rows,
    s,
  }: {
    columns: string[];
    rows: Array<Array<string | number>>;
    s: SheetChangeSummary;
  }) {
    const maxRows = 8;
    const shown = rows.slice(0, maxRows);
    const bits: string[] = [];
  if (s.rowsAdded) bits.push(`${s.rowsAdded} rows added`);
  if (s.rowsEdited) bits.push(`${s.rowsEdited} rows edited`);
  if (s.rowsDeleted) bits.push(`${s.rowsDeleted} rows deleted`);
  if (s.formulasAdded) bits.push(`${s.formulasAdded} formulas added`);
  if (s.formulasEdited) bits.push(`${s.formulasEdited} formulas edited`);
  if (s.formulasDeleted) bits.push(`${s.formulasDeleted} formulas deleted`);


    return (
      <div className="px-2.5 pb-3 pt-2.5">
        {/* Notion-like table surface: ONE border container */}
        <div className="overflow-hidden rounded-xl  bg-white">
          {/* Header row */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((c) => (
              <div
                key={c}
                className="border-b border-neutral-200 px-3 py-2 text-[12px] font-medium text-neutral-500"
              >
                <div className="truncate">{c}</div>
              </div>
            ))}
          </div>
  
          {/* Body rows */}
          <div className="divide-y divide-neutral-200">
            {shown.map((r, i) => (
              <div
                key={i}
                className="grid"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
              >
                {r.map((cell, j) => (
                  <div key={j} className="px-3 py-2 text-[13px] text-neutral-800">
                    <div className="truncate">{cell}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
  
        {rows.length > maxRows ? (
          <div className="mt-2 px-1 flex flex-row justify-between text-[12px] text-neutral-400">
           <div> Showing {maxRows} of {rows.length} rows</div>
           {s.dataNotes?.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {bits.map((b, i) => (
            <span key={i} className="text-neutral-600">
              {b}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-neutral-500">No change summary available.</div>
      )}
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
        <HeaderLinkButton
          label={d.headerAction ?? "Open sheet"}
          onClick={d.onOpen}
        />
      }
    >
      <div className="px-4 py-2">
        {d.meta ? (
          <div className="mt-1 text-[13px] text-neutral-500">{d.meta}</div>
        ) : null}
      </div>

    

      {/* single divider before table */}
      <Divider />
      <SheetTablePreview columns={d.columns} rows={d.rows} s={d.summary!} />
    </ActionCardShell>
  );
}

/* ───────────────────────── File edited (PDF/Doc changes) ───────────────────────── */

function FileEditedCard({ d }: { d: FileEditedDeliverable }) {
    const hasDocs = Boolean(d.beforeDoc || d.afterDoc);
  
    return (
      <ActionCardShell
        deliverable={d}
        headerRight={
          <HeaderLinkButton label={d.headerAction ?? "Open"} onClick={d.onOpen} />
        }
      >
      
  
  
        <div className="px-4 pb-4">
          {/* change bullets */}
        
  
          {/* before/after docs using SAME preview */}
          {hasDocs ? (
            <div className="mt-3 grid gap-6 ">

  
              {d.afterDoc ? (
                <div className="overflow-hidden rounded-2xl  bg-white">
                 
                 
                  <DocPreview d={d.afterDoc} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="px-4 py-3">
        
        <div className="mt-1 text-[13px] text-neutral-500">
          {d.meta ? d.meta : "Updated"}
          {d.fileType ? ` • ${d.fileType.toUpperCase()}` : ""}
          {d.changeSummary ? ` • ${d.changeSummary}` : ""}
        </div>
      </div>
      </ActionCardShell>
    );
  }
/* ───────────────────────── Code diff (kept as separate option) ───────────────────────── */

function CodeDiffPreview({ hunks }: { hunks: CodeChangeDeliverable["hunks"] }) {
  const maxLines = 14;
  const flattened: Array<{ type: "add" | "del" | "ctx"; text: string }> = [];

  for (const h of hunks) {
    if (h.header) flattened.push({ type: "ctx", text: h.header });
    for (const l of h.lines) flattened.push(l);
  }

  const shown = flattened.slice(0, maxLines);

  return (
    <div className="px-4 py-4">
      <div className="rounded-xl bg-neutral-50">
        <div className="px-3 py-2 text-[12px] font-medium text-neutral-600">
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

function CodeChangeCard({ d }: { d: CodeChangeDeliverable }) {
  return (
    <ActionCardShell
      deliverable={d}
      headerRight={<HeaderLinkButton label={d.headerAction ?? "View changes"} onClick={d.onOpen} />}
    >
      <div className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[14px] font-medium text-neutral-900">{d.title}</div>
          {d.language ? (
            <div className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-500">
              {d.language}
            </div>
          ) : null}
        </div>
        {d.meta ? <div className="mt-1 text-[13px] text-neutral-500">{d.meta}</div> : null}
      </div>
      <Divider />
      <CodeDiffPreview hunks={d.hunks} />
    </ActionCardShell>
  );
}

/* ───────────────────────── Public list ───────────────────────── */

export function Deliverables({ items }: { items: Deliverable[] }) {
  return (
    <div className="mt-16 pb-24">
      <div className="flex flex-row items-center justify-between"><div className="text-sm font-medium text-neutral-400">Deliverables</div>
        <div className="text-sm font-medium text-neutral-400">
            <PlusIcon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {items.map((d, idx) => {
          if (d.kind === "email") return <EmailCard key={idx} d={d} />;
          if (d.kind === "doc") return <DocCard key={idx} d={d} />;
          if (d.kind === "sheet") return <SheetCard key={idx} d={d} />;
          if (d.kind === "file_edited") return <FileEditedCard key={idx} d={d} />;
          return <CodeChangeCard key={idx} d={d} />;
        })}
      </div>
    </div>
  );
}