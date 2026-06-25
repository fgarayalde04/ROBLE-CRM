'use client'
import type { PerfilData, QuestionKey, OptionKey } from './types'
import { SCORES, calcScore, scoreToProfile } from './types'

interface Props {
  data: PerfilData
  onChange: (d: PerfilData) => void
}

const QUESTIONS: {
  key: QuestionKey
  label: string
  options: { key: OptionKey; label: string }[]
}[] = [
  {
    key: 'q1',
    label: '1. Edad',
    options: [
      { key: 'A', label: 'Menos de 40 años' },
      { key: 'B', label: 'Entre 40 y 50 años' },
      { key: 'C', label: 'Más de 50 años' },
      { key: 'D', label: 'Pensionado' },
    ],
  },
  {
    key: 'q2',
    label: '2. ¿Qué porcentaje del patrimonio líquido del Cliente representa el monto a invertir?',
    options: [
      { key: 'A', label: 'Menos del 50%' },
      { key: 'B', label: 'Entre el 50% y el 75%' },
      { key: 'C', label: 'Más del 75%' },
    ],
  },
  {
    key: 'q3',
    label: '3. ¿Cómo describe la expectativa de ingresos del Cliente en los próximos 5 años?',
    options: [
      { key: 'A', label: 'Los ingresos deben aumentar' },
      { key: 'B', label: 'Los ingresos deben mantenerse estables' },
      { key: 'C', label: 'Los ingresos deben disminuir' },
    ],
  },
  {
    key: 'q4',
    label: '4. ¿Cuenta el Cliente con un fondo de reservas adicionales que le permita cubrir gastos durante 6 meses ante una eventual emergencia?',
    options: [
      { key: 'A', label: 'Sí' },
      { key: 'B', label: 'No' },
    ],
  },
  {
    key: 'q5',
    label: '5. ¿Por cuánto tiempo espera mantener el Cliente sus inversiones?',
    options: [
      { key: 'A', label: 'Más de 5 años' },
      { key: 'B', label: 'Entre 3 y 5 años' },
      { key: 'C', label: 'Entre 1 y 3 años' },
      { key: 'D', label: 'Menos de 1 año' },
    ],
  },
  {
    key: 'q6',
    label: '6. ¿Piensa el Cliente realizar algún retiro de su inversión durante los tres meses siguientes?',
    options: [
      { key: 'A', label: 'No' },
      { key: 'B', label: 'Sí, pero menos del 15% del total de su cuenta' },
      { key: 'C', label: 'Sí, y más del 15% del total de su cuenta' },
      { key: 'D', label: 'No tiene certeza' },
    ],
  },
  {
    key: 'q7',
    label: '7. ¿Cuál describe mejor el objetivo de inversión del Cliente y su tolerancia a fluctuaciones?',
    options: [
      { key: 'A', label: 'Preservación de capital: no quiere arriesgar su inversión inicial y no se siente cómodo con fluctuaciones a corto plazo.' },
      { key: 'B', label: 'Conservador: le gustaría preservar su inversión, pero acepta pequeñas fluctuaciones en el valor, incluyendo posibles pérdidas en períodos menores a un año.' },
      { key: 'C', label: 'Moderado: puede aceptar fluctuaciones negativas en el mediano plazo (1 a 2 años) con el fin de obtener tasas mayores.' },
      { key: 'D', label: 'Agresivo: le gustaría los mayores rendimientos posibles. Acepta fluctuaciones negativas por períodos mayores a dos años, incluyendo pérdida de inversión inicial.' },
    ],
  },
  {
    key: 'q8',
    label: '8. Experiencia del Cliente como inversionista:',
    options: [
      { key: 'A', label: 'Limitada: tiene muy poca experiencia en inversiones.' },
      { key: 'B', label: 'Moderada: tiene alguna experiencia en inversiones y le gustaría recibir asesoría adicional.' },
      { key: 'C', label: 'Extensa: es un inversionista activo y experto, y se siente cómodo tomando sus propias decisiones.' },
    ],
  },
  {
    key: 'q9a',
    label: '9a. Experiencia en Fondos mutuos:',
    options: [
      { key: 'A', label: 'Ninguna' },
      { key: 'B', label: 'Limitada' },
      { key: 'C', label: 'Moderada' },
      { key: 'D', label: 'Extensa' },
    ],
  },
  {
    key: 'q9b',
    label: '9b. Experiencia en Bonos:',
    options: [
      { key: 'A', label: 'Ninguna' },
      { key: 'B', label: 'Limitada' },
      { key: 'C', label: 'Moderada' },
      { key: 'D', label: 'Extensa' },
    ],
  },
  {
    key: 'q9c',
    label: '9c. Experiencia en Acciones:',
    options: [
      { key: 'A', label: 'Ninguna' },
      { key: 'B', label: 'Limitada' },
      { key: 'C', label: 'Moderada' },
      { key: 'D', label: 'Extensa' },
    ],
  },
  {
    key: 'q10',
    label: '10. Si el Cliente tuviera oportunidad de aumentar la tasa de rendimiento potencial aceptando mayor riesgo (incluyendo posibles pérdidas), ¿cuál describe mejor su preferencia?',
    options: [
      { key: 'A', label: 'No estaría dispuesto a asumir un mayor riesgo.' },
      { key: 'B', label: 'Está dispuesto a asumir un poco más de riesgo con parte de sus recursos disponibles.' },
      { key: 'C', label: 'Está dispuesto a asumir mucho más riesgo con parte de sus recursos disponibles.' },
    ],
  },
  {
    key: 'q11',
    label: '11. Suponga que el Cliente invirtió USD 80.000, que aumentó a USD 100.000, y luego inesperadamente disminuyó a USD 90.000. ¿Qué haría?',
    options: [
      { key: 'A', label: 'Invertiría más.' },
      { key: 'B', label: 'Se preocuparía. Transferiría parte de sus recursos hacia activos de menor riesgo.' },
      { key: 'C', label: 'Redimiría la totalidad de su inversión.' },
      { key: 'D', label: 'No haría ningún cambio.' },
    ],
  },
]

export default function PerfilInversorForm({ data, onChange }: Props) {
  const setAnswer = (q: QuestionKey, opt: OptionKey) => {
    const answers = { ...data.answers, [q]: opt }
    onChange({ ...data, answers })
  }

  const score = calcScore(data.answers)
  const profile = scoreToProfile(score)
  const answered = Object.keys(data.answers).length
  const total = QUESTIONS.length

  const profileColor = profile === 'agresivo' ? 'text-red-600 bg-red-50 border-red-200'
    : profile === 'moderado' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-blue-700 bg-blue-50 border-blue-200'

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 font-medium">{answered}/{total} preguntas respondidas</span>
          {answered === total && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${profileColor}`}>
              Puntaje: {score}/62 — {profile.charAt(0).toUpperCase() + profile.slice(1)}
            </span>
          )}
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#16A34A] rounded-full transition-all" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </div>

      {/* Questions */}
      {QUESTIONS.map(({ key, label, options }) => {
        const selected = data.answers[key]
        const score_val = selected ? (SCORES[key][selected] ?? 0) : null
        return (
          <div key={key} className={`border rounded-xl p-4 transition-colors ${selected ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'}`}>
            <p className="text-sm font-medium text-[#2D3F52] mb-3 leading-snug">{label}</p>
            <div className="space-y-2">
              {options.map((opt) => {
                const isSelected = selected === opt.key
                return (
                  <label key={opt.key} className={`flex items-start gap-3 cursor-pointer rounded-lg px-3 py-2 transition-all ${isSelected ? 'bg-green-100/60' : 'hover:bg-gray-50'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${isSelected ? 'border-[#16A34A] bg-[#16A34A]' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <input type="radio" className="sr-only" checked={isSelected} onChange={() => setAnswer(key, opt.key)} />
                    <span className="text-sm text-gray-700 leading-snug">{opt.label}</span>
                    {isSelected && <span className="ml-auto text-xs font-bold text-green-600 shrink-0">{SCORES[key][opt.key] ?? 0} pts</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Result */}
      {answered === total && (
        <div className={`border-2 rounded-xl p-5 ${profileColor}`}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70">Resultado del perfil</p>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-4xl font-black">{score}</p>
              <p className="text-sm opacity-70">de 62 puntos</p>
            </div>
            <div>
              <p className="text-2xl font-bold capitalize">{profile}</p>
              <p className="text-xs opacity-70">
                {profile === 'conservador' ? '0 – 21 puntos' : profile === 'moderado' ? '22 – 43 puntos' : '44 – 62 puntos'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Firma */}
      <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Datos del cliente</p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del cliente</label>
          <input value={data.nombre_cliente} onChange={e => onChange({ ...data, nombre_cliente: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]"
            placeholder="Nombre completo" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fecha de firma</label>
          <input type="date" value={data.firma_fecha} onChange={e => onChange({ ...data, firma_fecha: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]" />
        </div>
      </div>
    </div>
  )
}
