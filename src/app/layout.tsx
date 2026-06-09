import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
        <ClientLayout user={session}>
          <SpotlightSearch />
          <ChatWidget user={session} />
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}
