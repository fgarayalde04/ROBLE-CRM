/**
 * Headless browser singleton for factsheet scraping.
 * Uses @sparticuz/chromium-min in production (Vercel/Lambda).
 * Falls back to locally installed Chromium in dev.
 */
import { chromium as playwright } from 'playwright-core'
import type { Browser } from 'playwright-core'

let _browser: Browser | null = null

export async function getBrowser(): Promise<Browser | null> {
  if (_browser?.isConnected()) return _browser

  try {
    if (process.env.NODE_ENV === 'production') {
      const chromium = (await import('@sparticuz/chromium-min')).default
      _browser = await playwright.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(
          'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar'
        ),
        headless: true,
      })
    } else {
      // Local dev: try system Chrome
      for (const path of [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ]) {
        try {
          _browser = await playwright.launch({
            executablePath: path,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          })
          break
        } catch { /* try next */ }
      }
    }
  } catch (e) {
    console.error('[browser] launch failed:', e)
    return null
  }

  return _browser
}

export async function closeBrowser() {
  try { await _browser?.close() } catch { /* ignore */ }
  _browser = null
}
