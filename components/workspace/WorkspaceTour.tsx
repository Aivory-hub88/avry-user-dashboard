"use client"

/**
 * Four-step tour of the workspace: Rooms, Requests, Timeline, Teams. Each step
 * outlines an element marked `data-tour="<key>"` and shows a card under it.
 * Shown once after the first room opens (the empty-state stepper covers the
 * time before); "How it works" can start it again.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from "react"

export const TOUR_DONE_KEY = "aivory.workspace.tourDone"

export function tourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === "1"
  } catch {
    return true // no storage: don't nag on every visit
  }
}

export function markTourDone() {
  try {
    localStorage.setItem(TOUR_DONE_KEY, "1")
  } catch {
    /* private mode: the tour just shows again next time */
  }
}

const STEPS = [
  { key: "rooms", title: "Your rooms", body: "Each approved project gets a room. The orange badge means an agent is waiting for your approval." },
  { key: "requests", title: "Requests", body: "Start new work here. Owners also review their team's requests here; the number shows how many are waiting." },
  { key: "timeline", title: "Timeline", body: "Every room's tasks, deadlines and agent jobs on one calendar, plus requests still waiting for approval." },
  { key: "teams", title: "Teams", body: "Invite people and set who can request projects (editors) and who approves them (owners)." },
] as const

type Box = { top: number; left: number; width: number; height: number }
const CARD_W = 300
const GAP = 10

export default function WorkspaceTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = STEPS[i]

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`)
    if (!el) return setBox(null)
    const r = el.getBoundingClientRect()
    setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }))
  }, [step.key])

  useLayoutEffect(() => {
    document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`)?.scrollIntoView({ block: "nearest" })
    // Reading layout from the DOM is what a layout effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure()
  }, [measure, step.key])

  useEffect(() => {
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    // The tour opens while the page is still settling (sidebar width, rooms
    // rendering, banners above the list), which moves the target without a
    // window resize. Follow size changes of the target and the page, and poll
    // each frame for the first moments to catch pure position shifts.
    // The target and a few ancestors: content added above the target, or the
    // sidebar changing width, resizes one of them even when the target keeps its size.
    const ro = new ResizeObserver(() => measure())
    let node: Element | null = document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`)
    for (let i = 0; node && node !== document.body && i < 4; i++, node = node.parentElement) ro.observe(node)
    let frame = 0
    const until = performance.now() + 1500
    const tick = () => {
      measure()
      if (performance.now() < until) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [measure, step.key])

  const finish = useCallback(() => {
    markTourDone()
    onClose()
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish()
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1))
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finish])

  const vw = typeof window === "undefined" ? 1024 : window.innerWidth
  const vh = typeof window === "undefined" ? 768 : window.innerHeight
  const cardW = Math.min(CARD_W, vw - 32)
  // Under the target when there's room, otherwise above it; centred when the target is missing.
  const below = box ? box.top + box.height + GAP + 180 < vh || box.top < 200 : true
  const cardStyle = box
    ? {
        width: cardW,
        left: Math.max(16, Math.min(box.left + box.width / 2 - cardW / 2, vw - cardW - 16)),
        ...(below ? { top: Math.min(box.top + box.height + GAP, vh - 200) } : { bottom: vh - box.top + GAP }),
      }
    : { width: cardW, left: (vw - cardW) / 2, top: vh / 3 }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      <div className="absolute inset-0" onClick={finish} aria-hidden />
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/80 transition-all duration-200 ease-out"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" />
      )}
      <div className="absolute rounded-2xl border border-white/10 bg-[#202024] p-4 shadow-2xl transition-[top,left,bottom] duration-200 ease-out" style={cardStyle}>
        <div className="text-[11px] text-white/45">
          {i + 1} of {STEPS.length}
        </div>
        <div className="mt-1 text-[14px] font-medium text-white">{step.title}</div>
        <div className="mt-1.5 text-[12px] leading-relaxed text-white/60">{step.body}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-[12px] text-white/45 hover:text-white/80">
            Skip
          </button>
          <div className="flex items-center gap-1.5">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="rounded-full px-3 py-1.5 text-[12px] text-white/65 hover:bg-white/[0.06]">
                Back
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => (i === STEPS.length - 1 ? finish() : setI(i + 1))}
              className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 hover:bg-white/90 active:scale-[0.97]"
            >
              {i === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
