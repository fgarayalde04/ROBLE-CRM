const http = require('http')
const { Client, LocalAuth } = require('whatsapp-web.js')
const QRCode = require('qrcode')
const { structureZapiaText } = require('./summarize')

const PORT = process.env.PORT || 3200
const SESSION_PATH = process.env.SESSION_PATH || './session'
// WhatsApp id of the Zapia chat (e.g. "59899123456@c.us"). Unset until the
// first run — leave unconfigured and check the logs for incoming senders.
const ZAPIA_CONTACT_ID = process.env.ZAPIA_CONTACT_ID || null
const RESEARCH_API_URL = process.env.RESEARCH_API_URL // e.g. https://roble-crm.up.railway.app
const RESEARCH_WORKER_SECRET = process.env.RESEARCH_WORKER_SECRET

if (!RESEARCH_API_URL || !RESEARCH_WORKER_SECRET) {
  console.error('[worker] Faltan RESEARCH_API_URL / RESEARCH_WORKER_SECRET — no puedo publicar briefs.')
}

let latestQrDataUrl = null
let ready = false

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

client.on('qr', async (qr) => {
  latestQrDataUrl = await QRCode.toDataURL(qr)
  console.log('[worker] QR generado — abrí /qr en el navegador para vincular WhatsApp.')
})

client.on('ready', () => {
  ready = true
  latestQrDataUrl = null
  console.log('[worker] WhatsApp conectado y listo.')
  if (!ZAPIA_CONTACT_ID) {
    console.log('[worker] ZAPIA_CONTACT_ID no configurado todavía — voy a loguear el id de cada mensaje entrante para que lo encuentres.')
  }
})

client.on('disconnected', (reason) => {
  ready = false
  console.error('[worker] WhatsApp desconectado:', reason)
})

client.on('message', async (msg) => {
  if (!ZAPIA_CONTACT_ID) {
    // Setup mode: help the operator find the right chat id.
    console.log(`[worker] mensaje recibido de "${msg.from}" (${(msg._data?.notifyName) || 'sin nombre'}): ${msg.body.slice(0, 60)}…`)
    return
  }

  if (msg.from !== ZAPIA_CONTACT_ID) return

  console.log('[worker] Mensaje de Zapia recibido, procesando…')
  try {
    const { headlines, sections } = await structureZapiaText(msg.body)
    if (headlines.length === 0) {
      console.error('[worker] El modelo no devolvió titulares — no publico el brief.')
      return
    }

    const briefDate = new Date().toISOString().slice(0, 10)
    const res = await fetch(`${RESEARCH_API_URL}/api/research/morning-brief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': RESEARCH_WORKER_SECRET,
      },
      body: JSON.stringify({ briefDate, headlines, sections }),
    })

    if (res.ok) {
      console.log(`[worker] Morning Brief ${briefDate} publicado en Roble.`)
    } else {
      const body = await res.text()
      console.error(`[worker] Roble rechazó el brief (${res.status}):`, body)
    }
  } catch (err) {
    console.error('[worker] Error procesando el mensaje de Zapia:', err)
  }
})

client.initialize()

// ─── Tiny HTTP server: /qr to link once, /health for Railway ──────────────
http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ready }))
    return
  }
  if (req.url === '/qr') {
    if (ready) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h1>WhatsApp ya vinculado.</h1>')
      return
    }
    if (!latestQrDataUrl) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h1>Generando QR…</h1><meta http-equiv="refresh" content="3">')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<h1>Escaneá con WhatsApp → Dispositivos vinculados</h1><img src="${latestQrDataUrl}" width="300" /><meta http-equiv="refresh" content="5">`)
    return
  }
  res.writeHead(404)
  res.end('Not found')
}).listen(PORT, () => {
  console.log(`[worker] HTTP en puerto ${PORT} (/qr para vincular, /health para status)`)
})
