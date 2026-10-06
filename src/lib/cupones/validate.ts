// Valida y normaliza el calendario que manda la pantalla antes de exportarlo o
// guardarlo: el asesor puede haber editado cualquier campo a mano.
import { sortBonds } from './parse'
import type { CouponBond, CouponCalendar } from './types'

const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v))
const str = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max)

export function parseCalendarInput(raw: any): { calendar: CouponCalendar } | { error: string } {
  if (!raw || !Array.isArray(raw.bonds)) return { error: 'Calendario inválido' }
  const docDate = iso(raw.docDate)
  if (!docDate) return { error: 'Falta la fecha del documento' }
  if (!str(raw.clientName)) return { error: 'Falta el nombre del cliente' }
  if (raw.bonds.length === 0) return { error: 'El calendario no tiene bonos' }
  if (raw.bonds.length > 200) return { error: 'Demasiados bonos' }

  const bonds: CouponBond[] = []
  for (const b of raw.bonds) {
    const months = Array.from(new Set<number>((Array.isArray(b.payMonths) ? b.payMonths : []).map(Number)))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
      .sort((a, c) => a - c)
    const issuer = str(b.issuer, 120) || str(b.cusip, 20)
    const nominal = num(b.nominal)
    const rate = num(b.couponRate)
    const day = Math.round(num(b.payDay))
    if (!months.length) return { error: `${issuer}: falta al menos un mes de pago` }
    if (!(nominal > 0) || !(rate > 0) || rate > 1) return { error: `${issuer}: revisá el nominal y el cupón` }
    if (!(day >= 1 && day <= 31)) return { error: `${issuer}: día de pago inválido` }
    if (b.needsFrequency) return { error: `${issuer}: confirmá la frecuencia de pago antes de exportar` }
    bonds.push({
      cusip: str(b.cusip, 20),
      isin: str(b.isin, 20) || null,
      description: str(b.description, 500),
      issuer,
      nominal,
      couponRate: rate,
      rateFromDescription: b.rateFromDescription == null ? null : num(b.rateFromDescription),
      rateFromPayments: b.rateFromPayments == null ? null : num(b.rateFromPayments),
      payMonths: months,
      payDay: day,
      maturity: iso(b.maturity),
      callDate: iso(b.callDate),
      nonCallable: !!b.nonCallable,
      fixedFloat: !!b.fixedFloat,
      payments: Array.isArray(b.payments)
        ? b.payments.filter((p: any) => iso(p?.payDate)).map((p: any) => ({ payDate: p.payDate, amount: num(p.amount) || 0 }))
        : [],
      needsFrequency: false,
    })
  }

  return {
    calendar: {
      accountNumber: str(raw.accountNumber, 40),
      accountShortName: str(raw.accountShortName, 120),
      baseCcy: str(raw.baseCcy, 5) || 'USD',
      asOfDate: iso(raw.asOfDate),
      accountTotal: raw.accountTotal == null ? null : num(raw.accountTotal),
      others: Array.isArray(raw.others) ? raw.others.slice(0, 200) : [],
      clientName: str(raw.clientName, 120),
      advisor: str(raw.advisor, 120),
      docDate,
      bonds: sortBonds(bonds),
    },
  }
}

/** "Calendario_Cupones_Juan_Perez" — sin caracteres que rompan un nombre de archivo. */
export function calendarFileBase(clientName: string) {
  const slug = clientName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `Calendario_Cupones_${slug || 'Cliente'}`
}
