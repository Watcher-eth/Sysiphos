"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cloud, Clock } from "lucide-react";

type Card = {
  icon: string;
  title: string;
};

const CARDS: Card[] = [
    {
      icon: "/icons/mail.png",
      title:
        "Summarize all new emails, flag urgent ones, and draft replies for approval at 9am every day.",
    },
    {
      icon: "/icons/calendar.png",
      title:
        "Daily schedule brief: highlight today’s meetings, prep notes, and any conflicts or travel time.",
    },
    {
      icon: "/icons/notes.jpeg",
      title:
        "Prepare a progress report for the client every week based on email updates.",
    },
    {
      icon: "/icons/target.jpeg",
      title:
        "Find me 5 potential clients for the week and prepare a short email to each of them.",
    },
    {
      icon: "/icons/bars.jpeg",
      title:
        "Weekly update: compile progress, blockers, and next steps into a clean status report.",
    },
    {
      icon: "/icons/invoice.jpeg",
      title:
        "Organize our receipts, check line items, and prepare statements once a month.",
    },
    {
      icon: "/icons/folder.png",
      title:
        "Rename and file documents, add tags, flag and consolidate duplicates.",
    },
    {
      icon: "/icons/handshake.png",
      title:
        "Prepare and schedule a new inventory email for our distributors every week.",
    },
    {
      icon: "/icons/plane.jpeg",
      title:
        "Find and book me a flight to Lisbon on Mondays for the next 4 weeks.",
    },
  ];
function TopIconSwitcher() {
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

      <div className="absolute bottom-[6px] h-[3px] w-3 rounded-full bg-neutral-900" />
    </div>
  );
}

function CardTile({ card }: { card: Card }) {
  return (
    <button
      className={[
        "rounded-3xl border border-neutral-200/70 bg-white p-4 text-left",
        "shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        "hover:shadow-[0_12px_28px_rgba(0,0,0,0.06)] hover:border-neutral-300",
        "transition",
      ].join(" ")}
    >
      <div className="flex  items-start gap-3">
      
          <img className="h-10 w-10" src={card.icon} alt={card.title} />

          <div className="text-[13px] leading-snug text-neutral-900">{card.title}</div>
        </div>
      </button>
    );
  }

export default function AutomationsPage() {
  return (
    <div className="min-h-screen bg-white">
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