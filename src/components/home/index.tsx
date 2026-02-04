"use client";

import { ChevronDown, Plus, Smile, Mic, ArrowUp, ShoppingCart, Mail, BarChart3, Settings } from "lucide-react";
import { useState } from "react";

const workflowSuggestions = [
  {
    icon: ShoppingCart,
    iconColor: "text-amber-600",
    title: "Auto-reorder inventory when stock falls below 10 units.",
  },
  {
    icon: Mail,
    iconColor: "text-purple-500",
    title: "Send a follow-up email 3 days after customer purchase.",
  },
  {
    icon: BarChart3,
    iconColor: "text-blue-500",
    title: "Generate weekly revenue report and notify accounting team.",
  },
];

export function WorkflowBuilder() {
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col h-full px-[15vw]">
      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Bot/gear icon */}
        <div className="mb-4">
          <div className="relative">
            <Settings className="w-10 h-10 text-gray-800 stroke-[1.5]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2.5 h-1 bg-gray-800 rounded-full mt-1" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-xl font-medium text-gray-900 mb-1">{"Let's build"}</h1>
        
        {/* Dropdown */}
        <button className="flex items-center gap-1 text-gray-400 hover:text-gray-500 transition-colors">
          <span className="text-lg font-light">New project</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom section */}
      <div className="pb-4 px-4">
        {/* Explore more link */}
        <div className="flex justify-end mb-2">
          <button className="text-xs text-gray-400 hover:text-gray-500 transition-colors">
            Explore more
          </button>
        </div>

        {/* Suggestion cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {workflowSuggestions.map((suggestion, index) => (
            <button
              key={index}
              className="flex flex-col items-start p-3 border border-gray-200 hover:border-gray-300 rounded-lg text-left transition-colors bg-white"
            >
              <suggestion.icon className={`w-4 h-4 ${suggestion.iconColor} mb-2`} />
              <span className="text-xs text-gray-700 leading-relaxed">{suggestion.title}</span>
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="border border-gray-200 rounded-xl bg-white">
          <div className="px-4 pt-4 pb-3">
            <textarea
              placeholder="Ask Codex anything, @ to add files, / for commands"
              className="w-full text-sm  text-gray-600 placeholder:text-gray-400 outline-none bg-transparent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                <Plus className="w-4 h-4 text-gray-400" />
              </button>
              <button className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 px-2 py-1.5 rounded transition-colors">
                <span className="font-medium">GPT-5.2-Codex</span>
                <span className="text-gray-400">Medium</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <Smile className="w-4 h-4 text-gray-400" />
              </button>
              <button className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <Mic className="w-4 h-4 text-gray-400" />
              </button>
              <button className="p-1.5 bg-green-500 hover:bg-green-600 rounded-full transition-colors ml-1">
                <ArrowUp className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-3">
            <button className="text-xs text-gray-400 hover:text-gray-500 transition-colors">Local</button>
            <button className="text-xs text-gray-600 font-medium">Worktree</button>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-500 transition-colors">
              <Settings className="w-3 h-3" />
              <span>No environment</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-500 transition-colors">
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
              </svg>
              <span>From main</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
