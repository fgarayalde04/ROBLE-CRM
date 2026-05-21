import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'

// Opens a local folder path in macOS Finder.
// Only works when the Next.js server is running on macOS (local use).

export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json() as { path?: string }

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 })
    }

    // Sanitize: reject any path that looks suspicious
    if (path.includes(';') || path.includes('&') || path.includes('|') || path.includes('`')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    await new Promise<void>((resolve, reject) => {
      // "open" on macOS opens the folder in Finder
      exec(`open "${path.replace(/"/g, '\\"')}"`, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
