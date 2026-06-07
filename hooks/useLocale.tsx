"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { NextIntlClientProvider } from "next-intl"

// Import English messages statically so they're available on first render (SSR + client)
import enMessages from "@/messages/en.json"
import idMessages from "@/messages/id.json"

type Locale = "en" | "id"

const SUPPORTED_LOCALES: Locale[] = ["en", "id"]
const STORAGE_KEY = "aivory_locale"
const DEFAULT_LOCALE: Locale = "en"

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
  id: idMessages as Record<string, unknown>,
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocaleContext must be used within a LocaleProvider")
  return ctx
}

export function getInitialLocale(): Locale {
  try {
    if (typeof window === "undefined") return DEFAULT_LOCALE
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_LOCALE
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Start with English — available immediately on both server and client
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  // After mount, read the user's stored preference and switch if needed
  useEffect(() => {
    const stored = getInitialLocale()
    if (stored !== locale) {
      setLocaleState(stored)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLocale = (newLocale: Locale) => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return
    try {
      localStorage.setItem(STORAGE_KEY, newLocale)
    } catch {
      // localStorage unavailable — still update state for session
    }
    setLocaleState(newLocale)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone="Asia/Jakarta"
        onError={(error) => {
          // Suppress missing-message errors during SSR/prerendering.
          // These are non-fatal: the client will hydrate with the correct messages.
          if (error.code === "MISSING_MESSAGE") return
          if (error.code === "ENVIRONMENT_FALLBACK") return
          console.error(error)
        }}
        getMessageFallback={({ namespace, key }) =>
          [namespace, key].filter(Boolean).join(".")
        }
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  )
}
