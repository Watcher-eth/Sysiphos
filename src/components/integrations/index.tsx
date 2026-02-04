"use client"

import React from "react"

import { useState } from "react"
import { Search, Plus, RefreshCw, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Skill {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  installed?: boolean
}

const installedSkills: Skill[] = [
  {
    id: "skill-creator",
    name: "Skill Creator",
    description: "Create or update a skill",
    icon: <SkillCreatorIcon />,
    installed: true,
  },
  {
    id: "skill-installer",
    name: "Skill Installer",
    description: "Install curated skills from openai/skills or other repos",
    icon: <SkillInstallerIcon />,
    installed: true,
  },
]

const recommendedSkills: Skill[] = [
  {
    id: "atlas",
    name: "Atlas",
    description: "Use to manage tabs in ChatGPT Atlas and access your browser history.",
    icon: <AtlasIcon />,
  },
  {
    id: "cloudflare-deploy",
    name: "Cloudflare Deploy",
    description: "Deploy Workers, Pages, and platform services on Cloudflare",
    icon: <CloudflareIcon />,
  },
  {
    id: "develop-web-game",
    name: "Develop Web Game",
    description: "Web game dev + Playwright test loop",
    icon: <WebGameIcon />,
  },
  {
    id: "doc",
    name: "Doc",
    description: "Edit and review docx files",
    icon: <DocIcon />,
  },
  {
    id: "figma",
    name: "Figma",
    description: "Use Figma MCP for design-to-code work",
    icon: <FigmaIcon />,
  },
  {
    id: "figma-implement",
    name: "Figma Implement Design",
    description: "Turn Figma designs into production-ready code",
    icon: <FigmaImplementIcon />,
  },
  {
    id: "gh-address-comments",
    name: "GH Address Comments",
    description: "Address comments in a GitHub PR review",
    icon: <GitHubIcon />,
  },
  {
    id: "gh-fix-ci",
    name: "GH Fix CI",
    description: "Debug failing GitHub Actions CI",
    icon: <GitHubFixIcon />,
  },
  {
    id: "imagegen",
    name: "Imagegen",
    description: "Generate and edit images using OpenAI",
    icon: <ImagegenIcon />,
  },
  {
    id: "jupyter",
    name: "Jupyter Notebook",
    description: "Create Jupyter notebooks for experiments and tutorials",
    icon: <JupyterIcon />,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues in Codex",
    icon: <LinearIcon />,
  },
  {
    id: "netlify-deploy",
    name: "Netlify Deploy",
    description: "Deploy web projects to Netlify with the Netlify CLI",
    icon: <NetlifyIcon />,
  },
  {
    id: "notion-knowledge",
    name: "Notion Knowledge Capture",
    description: "Capture conversations into structured Notion pages",
    icon: <NotionIcon />,
  },
  {
    id: "notion-meeting",
    name: "Notion Meeting Intelligence",
    description: "Prep meetings with Notion context and tailored agendas",
    icon: <NotionMeetingIcon />,
  },
  {
    id: "notion-research",
    name: "Notion Research Documentation",
    description: "Research Notion content and produce briefs/reports",
    icon: <NotionResearchIcon />,
  },
  {
    id: "notion-spec",
    name: "Notion Spec to Implementation",
    description: "Turn Notion specs into implementation plans, tasks, and progress tracking",
    icon: <NotionSpecIcon />,
  },
  {
    id: "openai-docs",
    name: "OpenAI Docs",
    description: "Reference the official OpenAI Developer docs",
    icon: <OpenAIDocsIcon />,
  },
  {
    id: "pdf",
    name: "PDF",
    description: "Create, edit, and review PDFs",
    icon: <PDFIcon />,
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Web testing and automation with Playwright",
    icon: <PlaywrightIcon />,
  },
  {
    id: "render-deploy",
    name: "Render Deploy",
    description: "Deploy to Render cloud platform",
    icon: <RenderIcon />,
  },
]

function SkillCreatorIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    </div>
  )
}

function SkillInstallerIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </div>
  )
}

function AtlasIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    </div>
  )
}

function CloudflareIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M16.5 15.5c.28 0 .5-.22.5-.5v-1c0-2.5-2-4.5-4.5-4.5S8 11.5 8 14v1c0 .28.22.5.5.5h8z" />
        <path d="M19 13c1.1 0 2 .9 2 2s-.9 2-2 2h-1" fill="none" stroke="white" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

function WebGameIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 6v12M2 12h20" />
        <circle cx="7" cy="9" r="1" fill="#10B981" />
        <circle cx="17" cy="15" r="1" fill="#10B981" />
      </svg>
    </div>
  )
}

function DocIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    </div>
  )
}

function FigmaIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
      <svg width="16" height="22" viewBox="0 0 38 57" fill="none">
        <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE"/>
        <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
        <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
        <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
        <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
      </svg>
    </div>
  )
}

function FigmaImplementIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
      <svg width="16" height="22" viewBox="0 0 38 57" fill="none">
        <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="white"/>
        <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="white" fillOpacity="0.8"/>
        <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="white" fillOpacity="0.9"/>
        <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="white"/>
        <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="white" fillOpacity="0.7"/>
      </svg>
    </div>
  )
}

function GitHubIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#24292f">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    </div>
  )
}

function GitHubFixIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    </div>
  )
}

function ImagegenIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 via-teal-400 to-cyan-400 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}

function JupyterIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <rect width="24" height="24" fill="#F37626" rx="4"/>
        <text x="5" y="17" fill="white" fontSize="10" fontFamily="serif" fontStyle="italic">Ju</text>
      </svg>
    </div>
  )
}

function LinearIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#5E6AD2"/>
      </svg>
    </div>
  )
}

function NetlifyIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M17.3 6.3L12 1 6.7 6.3 12 11.6l5.3-5.3zM1 12l5.3 5.3L12 12 6.7 6.7 1 12zm11 0l5.3 5.3L23 12l-5.7-5.3L12 12zm0 0l-5.3 5.3L12 23l5.3-5.7L12 12z"/>
      </svg>
    </div>
  )
}

function NotionIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.046-.747.326-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.746 0-.933-.234-1.494-.934l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933l3.222-.187zM2.87.119l13.869-.933c1.683-.14 2.102.093 2.802.607l3.87 2.707c.466.373.606.746.606 1.26v17.058c0 1.026-.373 1.633-1.68 1.726l-15.458.933c-.98.047-1.448-.093-1.962-.747L1.2 18.96c-.56-.747-.793-1.307-.793-1.96V1.912C.407.886.78.166 2.87.12z"/>
      </svg>
    </div>
  )
}

function NotionMeetingIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.046-.747.326-.747.933z"/>
      </svg>
    </div>
  )
}

function NotionResearchIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.046-.747.326-.747.933z"/>
      </svg>
    </div>
  )
}

function NotionSpecIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.046-.747.326-.747.933z"/>
      </svg>
    </div>
  )
}

function OpenAIDocsIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    </div>
  )
}

function PDFIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center">
      <span className="text-white text-xs font-bold">PDF</span>
    </div>
  )
}

function PlaywrightIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#2EAD33"/>
        <path d="M2 17l10 5 10-5" stroke="#2EAD33" strokeWidth="2" fill="none"/>
        <path d="M2 12l10 5 10-5" stroke="#E2574C" strokeWidth="2" fill="none"/>
      </svg>
    </div>
  )
}

function RenderIcon() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
        <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2"/>
        <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2" fill="none"/>
      </svg>
    </div>
  )
}

function InstalledSkillCard({ skill }: { skill: Skill }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
      {skill.icon}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground text-sm">{skill.name}</h3>
        <p className="text-muted-foreground text-sm truncate">{skill.description}</p>
      </div>
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
        <ExternalLink className="w-4 h-4" />
      </Button>
    </div>
  )
}

function RecommendedSkillCard({ skill }: { skill: Skill }) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors group">
      {skill.icon}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground text-sm">{skill.name}</h3>
        <p className="text-muted-foreground text-sm truncate">{skill.description}</p>
      </div>
      <Button 
        variant="ghost" 
        size="icon" 
        className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  )
}

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredRecommended = recommendedSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search skills"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64 h-9 bg-background"
              />
            </div>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New skill
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-1">Skills</h1>
          <p className="text-muted-foreground">
            Give Codex superpowers.{" "}
            <a href="#" className="text-blue-500 hover:underline">
              Learn more
            </a>
          </p>
        </div>

        {/* Installed Section */}
        <section className="mb-10">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Installed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {installedSkills.map((skill) => (
              <InstalledSkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        </section>

        {/* Recommended Section */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Recommended</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {filteredRecommended.map((skill) => (
              <RecommendedSkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
