import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ClientLayout from '@/components/ClientLayout'
import SpotlightSearch from '@/components/SpotlightSearch'
import ChatWidget from '@/components/ChatWidget'
import ServiceWorkerRegister from '@/components/push/ServiceWorkerRegister'
import { getSession } from '@/lib/auth'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { template: '%s | Roble Capital', default: 'Roble Capital' },
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Roble',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B2E3C',
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
          <ServiceWorkerRegister />
          <SpotlightSearch />
          <ChatWidget user={session} />
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}
