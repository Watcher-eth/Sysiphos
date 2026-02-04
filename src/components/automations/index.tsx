"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cloud, Clock } from "lucide-react";

type Card = {
  icon: string;
  iconBg: string;
  title: string;
};

const CARDS: Card[] = [
  {
    icon: "🗓️",
    iconBg: "bg-red-50",
    title:
      "Scan recent commits (since the last run, or last 24h) for likely bugs and propose minimal fixes.",
  },
  {
    icon: "📘",
    iconBg: "bg-blue-50",
    title: "Draft weekly release notes from merged PRs (include links when available).",
  },
  {
    icon: "🟣",
    iconBg: "bg-purple-50",
    title: "Summarize yesterday's git activity for standup.",
  },
  {
    icon: "📉",
    iconBg: "bg-sky-50",
    title:
      "Summarize CI failures and flaky tests from the last CI window; suggest top fixes.",
  },
  {
    icon: "🏆",
    iconBg: "bg-amber-50",
    title: "Create a small classic game with minimal scope.",
  },
  {
    icon: "🧠",
    iconBg: "bg-pink-50",
    title: "From recent PRs and reviews, suggest next skills to deepen.",
  },
  {
    icon: "✏️",
    iconBg: "bg-orange-50",
    title:
      "Synthesize this week's PRs, rollouts, incidents, and reviews into a weekly update.",
  },
  {
    icon: "📊",
    iconBg: "bg-indigo-50",
    title:
      "Compare recent changes to benchmarks or traces and flag regressions early.",
  },
  {
    icon: "🧹",
    iconBg: "bg-orange-50",
    title: "Detect dependency and SDK drift and propose a minimal alignment plan.",
  },
];

function TopIconSwitcher() {
  // Icons to cycle between (you can add more)
  const icons = React.useMemo(
    () => [
      { key: "clock", Node: Clock },
      { key: "cloud", Node: Cloud },
    ],
    []
  );

  const [i, setI] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % icons.length), 1800);
    return () => clearInterval(t);
  }, [icons.length]);

  const Active = icons[i]!.Node;

  return (
    <div className="relative grid place-items-center">
      {/* Animated swap (rotate in/out like the video) */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={icons[i]!.key}
          initial={{ opacity: 0, rotate: -35, scale: 0.9, y: -2 }}
          animate={{ opacity: 1, rotate: 0, scale: 1, y: 0 }}
          exit={{ opacity: 0, rotate: 35, scale: 0.9, y: 2 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="grid place-items-center"
        >
          <Active className="h-11 w-11 text-neutral-900 stroke-[2.25]" />
        </motion.div>
      </AnimatePresence>

      {/* Little “mouth” line like your reference */}
      <div className="absolute bottom-[6px] h-[3px] w-3 rounded-full bg-neutral-900" />
    </div>
  );
}

function CardTile({ card }: { card: Card }) {
  return (
    <button
      className={[
        "rounded-2xl border border-neutral-200/70 bg-white p-5 text-left",
        "shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        "hover:shadow-[0_12px_28px_rgba(0,0,0,0.06)] hover:border-neutral-300",
        "transition",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Tiny “Airbnb-ish” icon tile */}
        <div
          className={[
            "grid h-9 w-9 place-items-center rounded-xl border border-neutral-200",
            card.iconBg,
            "shadow-[0_6px_14px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]",
          ].join(" ")}
        >
          <span className="text-base">{card.icon}</span>
        </div>

        <div className="text-[13px] leading-snug text-neutral-900">
          {card.title}
        </div>
      </div>
    </button>
  );
}

export default function AutomationsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top right actions */}
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-end px-8 pt-6">
        <div className="flex items-center gap-4">
          <button className="text-sm text-neutral-400 hover:text-neutral-600 transition">
            Learn more
          </button>
          <button
            className={[
              "inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2",
              "text-sm text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]",
              "hover:bg-neutral-800 transition",
            ].join(" ")}
          >
            <span className="text-lg leading-none">+</span>
            <span className="font-medium">New automation</span>
          </button>
        </div>
      </div>

      {/* Center content */}
      <main className="mx-auto flex w-full max-w-[1120px] flex-col items-center px-8">
        <div className="mt-28 flex flex-col items-center">
          <TopIconSwitcher />

          <div className="mt-5 flex items-center gap-3">
            <h1 className="text-[40px] font-semibold tracking-tight text-neutral-900">
              Workflows
            </h1>
            <span className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-500">
              Beta
            </span>
          </div>

          <p className="mt-2 text-sm text-neutral-500">
            Automate work by setting up scheduled tasks
          </p>
        </div>

        {/* Cards grid */}
        <div className="mt-12 grid w-full max-w-[880px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c, idx) => (
            <CardTile key={idx} card={c} />
          ))}
        </div>

        <button className="mt-10 text-sm text-neutral-400 hover:text-neutral-600 transition">
          Explore more
        </button>

        <div className="h-24" />
      </main>
    </div>
  );
}