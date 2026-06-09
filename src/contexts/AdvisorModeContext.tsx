'use client'

import { createContext, useContext } from 'react'

export interface AdvisorModeContextValue {
  advisorMode: boolean
  setAdvisorMode: (v: boolean) => void
  initialized: boolean
}

export const AdvisorModeContext = createContext<AdvisorModeContextValue>({
  advisorMode: false,
  setAdvisorMode: () => {},
  initialized: false,
})

export function useAdvisorModeCtx() {
  return useContext(AdvisorModeContext)
}
