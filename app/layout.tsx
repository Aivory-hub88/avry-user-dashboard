import type { Metadata } from "next"
import { Inter_Tight, Nunito, Manrope } from "next/font/google"
import Sidebar from "@/components/shared/Sidebar"
import ClientShell from "@/components/ClientShell"
import LocaleWrapper from "@/components/LocaleWrapper"
import DashboardEntryGate from "@/components/routing/dashboard-entry-gate"
import { TokenInitializer } from "@/components/TokenInitializer"
import { ModeProvider } from "@/contexts/ModeContext"
import { RouterProvider } from "@/contexts/RouterContext"
import { SettingsModalProvider } from "@/contexts/SettingsModalContext"
import "@/styles/globals.css"
import "@/styles/workflow-nodes.css"

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-nunito",
})

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  title: "Aivory Dashboard",
  description: "AI-powered workflow automation dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${nunito.variable}`}>
      <body className={`flex h-screen bg-[#353531] overflow-hidden ${manrope.className}`}>
        <TokenInitializer />
        <LocaleWrapper>
          <ModeProvider>
            <RouterProvider>
              <SettingsModalProvider>
                <DashboardEntryGate>
                  <Sidebar />
                  <main className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto">
                    {children}
                  </main>
                  <ClientShell />
                </DashboardEntryGate>
              </SettingsModalProvider>
            </RouterProvider>
          </ModeProvider>
        </LocaleWrapper>
      </body>
    </html>
  )
}
