export default function MovimientosTab() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div className="text-3xl mb-3">🧾</div>
      <p className="text-sm font-semibold text-gray-600">Todavía no hay movimientos cargados</p>
      <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
        Esta sección va a mostrar depósitos, retiros, compras, ventas y otros movimientos de la cuenta —
        con fecha, tipo, instrumento y monto — a medida que se incorpore la fuente de datos de transacciones.
        Con eso también va a ser posible calcular una rentabilidad real (TWR), a diferencia de la variación
        de Market Value que se muestra hoy en Resumen y Rendimiento.
      </p>
    </div>
  )
}
