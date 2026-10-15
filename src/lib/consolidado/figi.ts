// Cupón y vencimiento de bonos por CUSIP desde OpenFIGI, para los que no los
// traen los reportes (Morgan "Holdings - Cost Basis" no tiene ninguno de los
// dos). El ticker de OpenFIGI de un bono es "PETBRA 6 01/13/35",
// "MS V6.296 10/18/28", "CSANBZ 8.25 PERP" o "XXX 6 1/2 03/15/30".
import { mapFIGI, type FIGIJob } from '@/lib/openfigi'
import type { Terminos } from './types'

const cache = new Map<string, Terminos | null>()

/** Ticker de bono de OpenFIGI → tasa (decimal) y vencimiento. */
export function terminosDeTicker(ticker: string): Terminos | null {
  const m = ticker.toUpperCase().match(/\sV?(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s+(\d{2})\/(\d{2})\/(\d{2,4})\b|\sV?(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s+PERP\b/)
  if (!m) return null
  if (m[4]) {
    const tasa = Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0)
    const anio = m[6].length === 2 ? 2000 + Number(m[6]) : Number(m[6])
    return { tasa: tasa / 100, vencimiento: `${anio}-${m[4]}-${m[5]}` }
  }
  const tasa = Number(m[7]) + (m[8] ? Number(m[8]) / Number(m[9]) : 0)
  return { tasa: tasa / 100, vencimiento: null, perpetuo: true }
}

/** ISIN de EE.UU. armado a partir del CUSIP (dígito verificador Luhn). */
function isinDeCusip(cusip: string): string {
  const digitos = Array.from('US' + cusip).map((c) => String(parseInt(c, 36))).join('')
  let suma = 0
  Array.from(digitos).reverse().forEach((d, i) => {
    let n = Number(d)
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9 }
    suma += n
  })
  return `US${cusip}${(10 - (suma % 10)) % 10}`
}

async function consultar(jobs: FIGIJob[]): Promise<(Terminos | null)[]> {
  const out: (Terminos | null)[] = []
  // Sin API key OpenFIGI acepta hasta 10 identificadores por pedido.
  for (let i = 0; i < jobs.length; i += 10) {
    const res = await mapFIGI(jobs.slice(i, i + 10))
    for (const r of res) {
      const t = (r.data ?? []).map((d) => terminosDeTicker(d.ticker ?? '')).find(Boolean) ?? null
      out.push(t)
    }
  }
  return out
}

export async function terminosDeBonos(cusips: string[]): Promise<Record<string, Terminos>> {
  const pendientes = cusips.filter((c) => /^[A-Z0-9]{9}$/.test(c) && !cache.has(c)).slice(0, 60)
  if (pendientes.length) {
    try {
      // Los Reg S tienen CINS (empiezan con letra); los demás, CUSIP.
      const primera = await consultar(pendientes.map((c) => ({ idType: /^[A-Z]/.test(c) ? 'ID_CINS' : 'ID_CUSIP', idValue: c } as FIGIJob)))
      const faltan = pendientes.filter((_, i) => !primera[i])
      const segunda = faltan.length ? await consultar(faltan.map((c) => ({ idType: 'ID_ISIN', idValue: isinDeCusip(c) } as FIGIJob))) : []
      pendientes.forEach((c, i) => cache.set(c, primera[i]))
      faltan.forEach((c, i) => cache.set(c, segunda[i]))
    } catch (e) {
      console.error('[consolidado/figi]', e)
    }
  }
  const out: Record<string, Terminos> = {}
  for (const c of cusips) {
    const t = cache.get(c)
    if (t) out[c] = t
  }
  return out
}
