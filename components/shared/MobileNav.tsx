"use client"

/**
 * Phone-width navigation (< 768px). The sidebar becomes an off-canvas drawer
 * and this top bar holds the button that opens it. On md and up the bar is
 * hidden and the sidebar keeps its own expand/collapse toggle.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { asset } from "@/lib/asset"

type MobileNav = { open: boolean; setOpen: (open: boolean) => void }
const Ctx = createContext<MobileNav>({ open: false, setOpen: () => {} })

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const setOpen = useCallback((o: boolean) => setOpenState(o), [])

  // Close on navigation (also covers links outside the nav, e.g. the profile menu).
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpenState(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenState(false)
    // Rotating or widening past md leaves no drawer to close; reset it.
    const mq = window.matchMedia("(min-width: 768px)")
    const onMq = () => mq.matches && setOpenState(false)
    window.addEventListener("keydown", onKey)
    mq.addEventListener("change", onMq)
    return () => {
      window.removeEventListener("keydown", onKey)
      mq.removeEventListener("change", onMq)
    }
  }, [open])

  const value = useMemo(() => ({ open, setOpen }), [open, setOpen])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useMobileNav = () => useContext(Ctx)

export function MobileTopBar() {
  const { open, setOpen } = useMobileNav()
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-[var(--bg-elevated)] px-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-sidebar"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100 active:scale-[0.97]"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Image src={asset("/Aivory_logo_2026.svg?v=20261104")} alt="Aivory" width={91} height={13} className="h-[13px] w-auto object-contain" />
    </div>
  )
}
