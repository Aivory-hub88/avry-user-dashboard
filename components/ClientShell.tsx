"use client"

import dynamic from "next/dynamic"

const AiraFloatingAssistant = dynamic(
  () => import("./AiraFloatingAssistant"),
  { ssr: false }
)

export default function ClientShell() {
  return <AiraFloatingAssistant />
}
