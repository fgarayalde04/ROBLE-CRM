import type { Metadata } from 'next'
import { hasGoogleConnection, getGoogleEmail } from '@/lib/google/tokens'
import { supabaseAdmin } from '@/lib/supabase/admin'
import MailPageClient from './MailPageClient'

export const metadata: Metadata = { title: 'Mail | Roble Capital' }
export const dynamic = 'force-dynamic'

export default async function MailPage() {
  const [isConnected, googleEmail] = await Promise.all([
    hasGoogleConnection().catch(() => false),
    getGoogleEmail().catch(() => null),
  ])

  const { data: sentLogs } = await supabaseAdmin
    .from('activity_log')
    .select('id, description, created_at, created_by')
    .eq('action', 'email_enviado')
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="p-6 bg-[#F4F6F8] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">Mail</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            {isConnected && googleEmail
              ? `Gmail · ${googleEmail}`
              : 'Conectá Gmail para enviar y ver emails'}
          </p>
        </div>
        {!isConnected && (
          <a
            href="/api/auth/google-connect"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Conectar Gmail
          </a>
        )}
      </div>

      {!isConnected ? (
        /* Not connected state */
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-12 text-center max-w-md mx-auto">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-[#EEF0F4] flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Conectá tu cuenta Gmail</p>
          <p className="text-xs text-gray-400 mb-5">
            Vinculá tu cuenta de Google para enviar emails desde el CRM y ver tu bandeja de entrada del día.
          </p>
          <a
            href="/api/auth/google-connect"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#2D3F52' }}
          >
            Conectar Gmail
          </a>
        </div>
      ) : (
        <MailPageClient
          googleEmail={googleEmail}
          sentLogs={sentLogs ?? []}
          gmailConnected={isConnected as boolean}
        />
      )}
    </div>
  )
}
