import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import SpotlightSearch from '@/components/SpotlightSearch'
import ChatWidget from '@/components/ChatWidget'
import { getSession } from '@/lib/auth'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { template: '%s | Roble Capital', default: 'Roble Capital' },
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  // Login page — no sidebar
  if (!session) {
    return (
      <html lang="es" className={inter.variable}>
        <body className="font-sans">{children}</body>
      </html>
    )
  }

  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-[#F4F6F8] font-sans">
        <Sidebar user={session} />
        <SpotlightSearch />
        <ChatWidget user={session} />
        <div className="pl-64 min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
