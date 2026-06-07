"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { getWorkflowCount } from "@/hooks/useWorkflows"
import LanguagePill from "./LanguagePill"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import ConversationHistory from "../sidebar/ConversationHistory"
import UserProfile from "../UserProfile"

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  )
}

function ConsoleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}

function DiagnosticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  )
}

function BlueprintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function RoadmapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 21V9a2 2 0 0 1 2-2h2"/>
      <path d="M14 21V13a2 2 0 0 1 2-2h2"/>
      <path d="M10 9a2 2 0 0 1 2-2h2"/>
      <path d="M18 13a2 2 0 0 1 2-2h2"/>
    </svg>
  )
}

function WorkflowsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}

function ExecutionLogsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function IntegrationsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}

function AgentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <path d="M12 1v6m0 6v6" />
      <path d="M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24" />
      <path d="M1 12h6m6 0h6" />
      <path d="M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

const NAV_ICONS: Record<string, React.FC> = {
  console: ConsoleIcon,
  diagnostics: DiagnosticsIcon,
  blueprint: BlueprintIcon,
  roadmap: RoadmapIcon,
  workflows: WorkflowsIcon,
  executionLogs: ExecutionLogsIcon,
  integrations: IntegrationsIcon,
  agents: AgentsIcon,
  settings: SettingsIcon,
  home: HomeIcon,
  profile: ProfileIcon,
}

export default function Sidebar() {
  const pathname = usePathname() || ""
  const [workflowCount, setWorkflowCount] = useState(0)
  const t = useTranslations("nav")
  const { collapsed, toggle } = useSidebarCollapse()

  useEffect(() => {
    const update = () => setWorkflowCount(getWorkflowCount())
    update()
    window.addEventListener("storage", update)
    window.addEventListener("aivory_workflows_updated", update)
    return () => {
      window.removeEventListener("storage", update)
      window.removeEventListener("aivory_workflows_updated", update)
    }
  }, [])

  const navItems = [
    { key: "console",       href: "/console" },
    { key: "diagnostics",   href: "/diagnostics" },
    { key: "blueprint",     href: "/blueprint" },
    { key: "roadmap",       href: "/roadmap" },
    { key: "workflows",     href: "/workflows", badge: workflowCount > 0 ? workflowCount : null },
    { key: "executionLogs", href: "/logs" },
    { key: "integrations",  href: "/integrations" },
    { key: "agents",        href: "/agents" },
    { key: "profile",       href: "/dashboard", label: "Profile" },
    { key: "settings",      href: "/settings" },
  ]

  return (
    <aside className={`flex flex-col h-full bg-[#353531] border-r border-white/5 transition-all duration-300 ${collapsed ? "w-12" : "w-[220px]"}`}>
      {/* Logo / Header */}
      <div className="flex items-center gap-2 px-4 pt-8 pb-4">
        {!collapsed ? (
          <div className="flex items-center">
            <Image
              src="/Aivory_logo_2026.svg"
              alt="Aivory"
              width={100}
              height={28}
              className="object-contain"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full py-1">
            <Image
              src="/Aivory_icon_2026.svg"
              alt="Aivory"
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
        )}
      </div>

      {/* Collapsible Toggle Button */}
      <button
        onClick={toggle}
        className="flex items-center justify-center w-full py-2 text-zinc-400 hover:text-zinc-100 transition-colors"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight /> : <ChevronLeft />}
      </button>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = NAV_ICONS[item.key]
          const label = (item as any).label || t(item.key)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg text-sm transition-colors cursor-pointer group
                ${collapsed 
                  ? "justify-center w-9 h-9 mx-auto" 
                  : "gap-2 px-3 py-2"
                }
                ${isActive
                  ? "text-zinc-100 bg-white/5"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                }
              `}
            >
              <Icon />
              {!collapsed && (
                <div className="flex items-center justify-between flex-1">
                  <span>{label}</span>
                  {"badge" in item && item.badge !== null && (
                    <span className="bg-white/10 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
              {!collapsed && (
                <span className="sr-only">{label}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Conversation History */}
      <ConversationHistory collapsed={collapsed} />      {/* Bottom Section */}
      <div className="mt-auto pt-4 border-t border-white/5">
        <UserProfile />
        <div className="px-2">
          <LanguagePill />
          <a
            href="/"
            className={`flex items-center rounded-lg text-sm transition-colors cursor-pointer group
              ${collapsed
                ? "justify-center w-9 h-9 mx-auto"
                : "gap-2 px-3 py-2"
              }
              text-zinc-400 hover:text-zinc-100 hover:bg-white/5
            `}
          >
            <HomeIcon />
            {!collapsed && <span>{t("home")}</span>}
          </a>
        </div>
      </div>
    </aside>
  )
}
