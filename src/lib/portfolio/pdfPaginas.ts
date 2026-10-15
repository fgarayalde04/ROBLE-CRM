// Arma un PDF A4 apaisado a partir de páginas HTML (html2canvas + jsPDF).
// Cada `.pdf-page` puede ser más alta que una hoja: se corta en varias hojas
// sin partir los bloques marcados con data-pdf-keep-together. Lo usan el
// reporte de Portafolio y la Posición Consolidada.
export async function generarPdfDePaginas(pages: HTMLElement[], nombreArchivo: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pdfW = pdf.internal.pageSize.getWidth()
  const pdfH = pdf.internal.pageSize.getHeight()
  let firstPdfPage = true
  for (let i = 0; i < pages.length; i++) {
    const pageEl = pages[i]
    // Section boxes are marked data-pdf-keep-together so a slice
    // boundary never cuts through the middle of one — each logical
    // "page" div can legitimately grow past 297mm (more holdings, more
    // sections) and needs to spill onto extra physical PDF pages rather
    // than being squashed to fit a fixed height.
    const containerTop = pageEl.getBoundingClientRect().top
    const keepTogether = Array.from(pageEl.querySelectorAll('[data-pdf-keep-together]')).map(el => {
      const r = (el as HTMLElement).getBoundingClientRect()
      return { top: (r.top - containerTop), bottom: (r.bottom - containerTop) }
    })
    const canvas = await html2canvas(pageEl, { scale: 4, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: pageEl.scrollWidth })
    const scale = canvas.width / pageEl.scrollWidth
    const imgRatio = canvas.height / canvas.width
    const imgH = pdfW * imgRatio
    // Una página que se pasa apenas del alto de la hoja (redondeos, o una
    // sección que quedó justo al límite) se achica un poco para que entre
    // entera — si no, el corte deja una segunda hoja casi en blanco con
    // solo el margen y el pie.
    const FIT_TOLERANCE = 1.06
    if (imgH <= pdfH * FIT_TOLERANCE) {
      if (!firstPdfPage) pdf.addPage()
      firstPdfPage = false
      const fit = Math.min(1, pdfH / imgH)
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pdfW - pdfW * fit) / 2, 0, pdfW * fit, imgH * fit)
    } else {
      // Reserva un margen abajo de cada hoja física: sin esto, una fila
      // que justo entraba al límite quedaba pegada al borde de la página,
      // sin aire, y se sentía "cortado" aunque ninguna fila se partiera
      // a mitad. Se resta del alto útil antes de decidir dónde corta cada slice.
      const marginMM = 10
      const pxPerMM = canvas.width / pdfW
      const maxSliceH = Math.round((canvas.width * pdfH / pdfW) - (canvas.width * marginMM / pdfW))
      // La PRIMERA hoja física de cada página lógica ya trae su propio
      // padding (PAGE_PAD_MM) dibujado dentro del canvas — pero una hoja
      // de CONTINUACIÓN (ej. cuando el grupo de Bonos entero pasa a la
      // siguiente hoja física) arranca justo donde el contenido anterior
      // cortó, pegada al borde superior sin aire. Se le reserva un
      // margen arriba solo a esas, y se descuenta del alto disponible
      // para que el slice no termine pasándose del borde de abajo.
      const topContinuationMM = 8
      const topContinuationPx = Math.round(pxPerMM * topContinuationMM)
      let position = 0
      while (position < canvas.height) {
        const isContinuation = position > 0
        // Lo que queda es solo el margen inferior + el pie de la página
        // lógica (sin contenido): no vale una hoja nueva en blanco.
        if (isContinuation && canvas.height - position <= pxPerMM * 18) break
        const budget = isContinuation ? maxSliceH - topContinuationPx : maxSliceH
        let sliceH = Math.min(canvas.height - position, budget)
        const pageEnd = position + sliceH
        // Entre todas las secciones que quedarían cortadas por este
        // límite de página, hay que respetar la que empieza ANTES
        // (achicar el slice hasta ahí) — no la última que se evalúe en
        // el loop. Si se usa la última, una sección más abajo en la
        // página (o una fila anidada dentro de otra sección) puede
        // pisar el achique correcto de una anterior y terminar
        // cortándola al medio igual, que es justo lo que esto evita.
        let cutBefore = Infinity
        for (const s of keepTogether) {
          const sTop = s.top * scale, sBottom = s.bottom * scale
          const sectionFits = (sBottom - sTop) <= maxSliceH
          const wouldBeCut = sTop < pageEnd && sBottom > pageEnd
          if (sectionFits && wouldBeCut && sTop > position) {
            cutBefore = Math.min(cutBefore, sTop)
          }
        }
        if (cutBefore < Infinity) sliceH = cutBefore - position
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = sliceH
        const ctx = pageCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, position, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        if (!firstPdfPage) pdf.addPage()
        firstPdfPage = false
        const destH = pdfW * (sliceH / canvas.width)
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, isContinuation ? topContinuationMM : 0, pdfW, destH)
        position += sliceH
      }
    }
  }
  pdf.save(nombreArchivo)
}
