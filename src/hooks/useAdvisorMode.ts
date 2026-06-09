import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'advisor_mode_v1'
const COOKIE_NAME = 'advisor_mode'

function writeCookie(value: boolean) {
  const maxAge = 365 * 24 * 60 * 60
  document.cookie = `${COOKIE_NAME}=${value ? '1' : '0'}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function useAdvisorMode() {
  const [advisorMode, setAdvisorModeState] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    let value: boolean
    if (stored !== null) {
      // Respect explicit user preference
      value = stored === '1'
    } else {
      // Default: ON for mobile viewport, OFF for desktop
      value = window.innerWidth < 768
    }
    setAdvisorModeState(value)
    writeCookie(value)
    setInitialized(true)
  }, [])

  const setAdvisorMode = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    writeCookie(value)
    setAdvisorModeState(value)
  }, [])

  return { advisorMode, setAdvisorMode, initialized }
}
