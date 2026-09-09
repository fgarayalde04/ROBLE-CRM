// Regresión: al elegir un contacto de la lista, TradingEmailSearch llama a
// handleSelect(), que dispara onSelect() y, en el mismo tick, blur() sobre
// el input. El onBlur del padre (que agrega lo que haya en su propio
// estado de búsqueda) veía el valor VIEJO porque React todavía no había
// aplicado el setState de onChange — resultado real en producción: "el
// segundo mail no se envía" en Enviar Órdenes. El fix fue separar onSelect
// de onChange + un ref (justSelectedRef) que el onBlur chequea antes de
// agregar nada. Este test reproduce el wiring EXACTO de OrdenesClient.tsx
// (mismo onBlur, mismo justSelectedRef) para que una futura regresión de
// ese patrón la agarre acá, no en producción.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TradingEmailSearch from './TradingEmailSearch'

const CONTACTS = [
  { name: 'Ana Pérez', email: 'ana@example.com' },
  { name: 'Beto Ruiz', email: 'beto@example.com' },
]

// Mismo patrón que el bloque "Para" real en OrdenesClient.tsx: un wrapper
// con onBlur + justSelectedRef, envolviendo TradingEmailSearch.
function ParentHarness() {
  const [toEmails, setToEmails] = useState<string[]>([])
  const [toSearch, setToSearch] = useState('')
  const justSelectedRef = useRef(false)

  function addToEmail(email: string) {
    const trimmed = email.trim()
    if (trimmed && !toEmails.includes(trimmed)) setToEmails(prev => [...prev, trimmed])
    setToSearch('')
  }

  return (
    <div>
      <div
        onBlur={e => {
          if (justSelectedRef.current) { justSelectedRef.current = false; return }
          if (!e.currentTarget.contains(e.relatedTarget as Node) && toSearch.trim()) addToEmail(toSearch)
        }}
      >
        <TradingEmailSearch
          value={toSearch}
          onChange={setToSearch}
          onSelect={email => { justSelectedRef.current = true; addToEmail(email) }}
          placeholder="Buscar o escribir email…"
        />
      </div>
      <ul data-testid="to-emails">
        {toEmails.map(e => <li key={e}>{e}</li>)}
      </ul>
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/gmail/contacts')) {
      return { json: async () => ({ contacts: CONTACTS }) } as Response
    }
    throw new Error(`unexpected fetch: ${url}`)
  }))
})

async function pickSuggestion(user: ReturnType<typeof userEvent.setup>, typed: string, optionName: RegExp) {
  const input = screen.getByPlaceholderText('Buscar o escribir email…')
  await user.click(input) // dispara loadContacts()
  await user.type(input, typed)
  const option = await screen.findByRole('button', { name: optionName })
  await user.click(option)
}

describe('TradingEmailSearch + patrón onBlur de OrdenesClient (Para)', () => {
  it('agrega el contacto elegido, no el texto tipeado a medias', async () => {
    const user = userEvent.setup()
    render(<ParentHarness />)

    await pickSuggestion(user, 'ana', /ana@example\.com/)

    const items = await screen.findAllByRole('listitem')
    expect(items.map(li => li.textContent)).toEqual(['ana@example.com'])
    // El buscador queda vacío, no con "ana" pegado
    const input = screen.getByPlaceholderText('Buscar o escribir email…') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('permite elegir un SEGUNDO contacto — no se pierde por la carrera de estado', async () => {
    const user = userEvent.setup()
    render(<ParentHarness />)

    await pickSuggestion(user, 'ana', /ana@example\.com/)
    await pickSuggestion(user, 'beto', /beto@example\.com/)

    const items = await screen.findAllByRole('listitem')
    expect(items.map(li => li.textContent).sort()).toEqual(['ana@example.com', 'beto@example.com'])
  })
})
