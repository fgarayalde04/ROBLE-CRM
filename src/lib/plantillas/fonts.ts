import { Source_Serif_4, Source_Sans_3 } from 'next/font/google'

// Tipografías de las plantillas (Next las descarga en el build y las sirve
// desde la app, así el PDF sale igual aunque el server no tenga internet).
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'], variable: '--pl-serif', display: 'block' })
const sans = Source_Sans_3({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--pl-sans', display: 'block' })

export const plantillaFontsClass = [serif.variable, sans.variable].join(' ')
