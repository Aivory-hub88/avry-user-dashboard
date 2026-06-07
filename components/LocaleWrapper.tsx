"use client"

import { ReactNode } from "react"
import { LocaleProvider } from "@/hooks/useLocale"

export default function LocaleWrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}
