"use client"

import dynamic from "next/dynamic"

const AivoryAssistant = dynamic(
  () => import("./AivoryAssistant"),
  { ssr: false }
)

export default function ClientShell() {
  return <AivoryAssistant />
}
