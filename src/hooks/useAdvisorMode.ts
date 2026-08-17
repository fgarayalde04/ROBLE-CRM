import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'advisor_mode_v1'
const COOKIE_NAME = 'advisor_mode'

function writeCookie(value: boolean) {
  const maxAge = 365 * 24 * 60 * 60
  document.cookie = `${COOKIE_NAME}=${value ? '1' : '0'}; path=/; max-age=${maxAge}; SameSite=Lax`
}

/**
 * @param forcedByAdmin      When true, Modo Asesor is locked ON by the admin — user can't override it.
 * @param autoDefaultEligible When false, skip the "default ON for narrow viewports" heuristic on first
 *                            visit — used to keep non-advisor roles (CEO, admin, etc.) out of the
 *                            restrictive advisor UI by accident just because they're on a phone.
 */
export function useAdvisorMode(forcedByAdmin = false, autoDefaultEligible = true) {
  const [advisorMode, setAdvisorModeState] = useState(forcedByAdmin)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (forcedByAdmin) {
      // Locked by admin: always ON, no local preference respected
      setAdvisorModeState(true)
      writeCookie(true)
      setInitialized(true)
      return
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    let value: boolean
    if (stored !== null) {
      value = stored === '1'
    } else {
      // Default: ON for mobile viewport, OFF for desktop — only for roles eligible for auto-default
      value = autoDefaultEligible && window.innerWidth < 768
    }
    setAdvisorModeState(value)
    writeCookie(value)
    setInitialized(true)
  }, [forcedByAdmin])

  const setAdvisorMode = useCallback((value: boolean) => {
    if (forcedByAdmin) return // Can't override admin setting
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    writeCookie(value)
    setAdvisorModeState(value)
  }, [forcedByAdmin])

  return { advisorMode, setAdvisorMode, initialized, forcedByAdmin }
}
