"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import {
  Search,
  ChevronUp,
  LayoutGrid,
  BriefcaseBusiness,
  CalendarSync,
  ClipboardCheck,
  NotebookPen,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { icon: NotebookPen, label: "New Thread", href: "/" },
  { icon: CalendarSync, label: "Workflows", href: "/automations" },
  { icon: BriefcaseBusiness, label: "Tasks", href: "/tasks" },
  { icon: ClipboardCheck, label: "Review", href: "/review" },
  { icon: LayoutGrid, label: "Integrations", href: "/integrations" },
];

const teamAvatars = [
  { src: "https://i.pravatar.cc/150?img=1", fallback: "T1" },
  { src: "https://i.pravatar.cc/150?img=2", fallback: "T2" },
  { src: "https://i.pravatar.cc/150?img=3", fallback: "T3" },
  { src: "https://i.pravatar.cc/150?img=4", fallback: "T4" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const router = useRouter();
  const pathname = router.pathname;

  return (
    <aside className="flex h-screen w-64 flex-col p-2">
      {/* White Card at Top */}
      <div className="rounded-xl bg-white p-3">
        {/* Header */}
        <button className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="font-semibold text-foreground">Acme</span>
          </div>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Search */}
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <span className="flex-1">search</span>
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-xs font-medium">
              ⌘ K
            </kbd>
          </div>
        </div>

        {/* Teams Section */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Teams [23]
          </p>
          <div className="flex -space-x-2">
            {teamAvatars.map((avatar, i) => (
              <Avatar key={i} className="h-8 w-8 border-2 border-white">
                <AvatarImage src={avatar.src || "/placeholder.svg"} />
                <AvatarFallback className="text-xs">
                  {avatar.fallback}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-1 pt-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <li key={item.href} className="relative">
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 focus-visible:ring-offset-2",
                    active
                      ? "text-orange-700"
                      : "text-foreground hover:bg-white/50"
                  )}
                >
                  {/* Layout-animated selection background */}
                  {active ? (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-orange-100"
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 38,
                        mass: 0.7,
                      }}
                    />
                  ) : null}

                  {/* icon + label */}
                  <item.icon
                    className={cn(
                      "relative z-10 h-5 w-5",
                      active ? "text-orange-500" : "text-muted-foreground"
                    )}
                  />
                  <span className="relative z-10">{item.label}</span>

                  {/* subtle hover affordance */}
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity",
                      "group-hover:opacity-100"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="px-1 pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src="https://i.pravatar.cc/150?img=8" />
            <AvatarFallback>SS</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              Stephen S.
            </span>
            <span className="text-xs text-muted-foreground">
              stephen@srotimi.design
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}