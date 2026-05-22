import { Suspense } from 'react'
import Image from 'next/image'
import LoginForm from './LoginForm'

export const metadata = { title: 'Iniciar Sesión | Roble Capital' }

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F0F2F5' }}>
      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
          {/* Logo */}
          <div className="flex justify-center mb-7">
            <Image
              src="/download.png"
              alt="Roble Capital"
              width={210}
              height={58}
              className="object-contain"
              priority
            />
          </div>

          <Suspense
            fallback={
              <div className="h-40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-[#16A34A] rounded-full animate-spin" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 pb-6">
        © {new Date().getFullYear()} Roble Capital Wealth Management
      </p>
    </div>
  )
}
