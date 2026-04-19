import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'

export const Route = createFileRoute('/api/recipes/$id/printable')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const url = import.meta.env.VITE_SUPABASE_URL!
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
        const supabase = createClient(url, key)

        const { data: r } = await supabase
          .from('recipes')
          .select('id, name, hook, description, servings, prep_time, cook_time, instructions, pro_tips, serving_suggestions, storage_instructions, reheating_instructions, active')
          .eq('id', params.id)
          .maybeSingle()

        if (!r || r.active === false) {
          return new Response('Recipe not found', { status: 404 })
        }

        const { data: ings } = await supabase
          .from('recipe_ingredients')
          .select('name, quantity, unit, notes')
          .eq('recipe_id', params.id)
          .order('name')

        const doc = new jsPDF({ unit: 'pt', format: 'letter' })
        const W = doc.internal.pageSize.getWidth()
        const H = doc.internal.pageSize.getHeight()
        const M = 54
        let y = M

        const ensure = (need: number) => {
          if (y + need > H - M) { doc.addPage(); y = M }
        }

        // Header
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(120)
        doc.text('VPS FINEST · AURORA, OHIO', M, y)
        y += 24
        doc.setTextColor(20)
        doc.setFontSize(22)
        doc.setFont('helvetica', 'bold')
        const titleLines = doc.splitTextToSize(r.name, W - M * 2)
        doc.text(titleLines, M, y)
        y += titleLines.length * 24 + 4

        if (r.hook) {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(11)
          doc.setTextColor(80)
          const hl = doc.splitTextToSize(r.hook, W - M * 2)
          doc.text(hl, M, y)
          y += hl.length * 14 + 8
        }

        // Quick facts
        doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 16
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60)
        const facts = [
          r.prep_time != null ? `Prep ${r.prep_time}m` : null,
          r.cook_time != null ? `Cook ${r.cook_time}m` : null,
          r.servings != null ? `Serves ${r.servings}` : null,
        ].filter(Boolean).join('   ·   ')
        if (facts) { doc.text(facts, M, y); y += 18 }
        doc.line(M, y, W - M, y); y += 22

        // Ingredients
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
        doc.text('Ingredients', M, y); y += 16
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(40)
        for (const i of ings || []) {
          ensure(16)
          const qty = [i.quantity, i.unit].filter(Boolean).join(' ')
          const line = `•  ${qty ? qty + '  ' : ''}${i.name}${i.notes ? `  (${i.notes})` : ''}`
          const wrapped = doc.splitTextToSize(line, W - M * 2)
          doc.text(wrapped, M, y)
          y += wrapped.length * 14
        }
        y += 12

        // Instructions
        ensure(40)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
        doc.text('Instructions', M, y); y += 16
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(40)
        const steps = (r.instructions || '').split(/\n+/).map((s: string) => s.trim()).filter(Boolean)
        steps.forEach((step: string, idx: number) => {
          const wrapped = doc.splitTextToSize(`${idx + 1}.  ${step}`, W - M * 2)
          ensure(wrapped.length * 14 + 8)
          doc.text(wrapped, M, y)
          y += wrapped.length * 14 + 6
        })

        // Pro tips
        const tips: string[] = Array.isArray(r.pro_tips) ? r.pro_tips.filter((t: any) => typeof t === 'string') : []
        if (tips.length) {
          y += 8
          ensure(40)
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
          doc.text('Pro tips', M, y); y += 16
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(40)
          tips.forEach((tip, idx) => {
            const wrapped = doc.splitTextToSize(`${idx + 1}.  ${tip}`, W - M * 2)
            ensure(wrapped.length * 14 + 4)
            doc.text(wrapped, M, y); y += wrapped.length * 14 + 4
          })
        }

        // Storage / reheating
        const extras = [
          r.serving_suggestions && ['Serving', r.serving_suggestions],
          r.storage_instructions && ['Storage', r.storage_instructions],
          r.reheating_instructions && ['Reheating', r.reheating_instructions],
        ].filter(Boolean) as [string, string][]
        for (const [label, body] of extras) {
          y += 10; ensure(40)
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20)
          doc.text(label, M, y); y += 14
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60)
          const wrapped = doc.splitTextToSize(body, W - M * 2)
          ensure(wrapped.length * 13)
          doc.text(wrapped, M, y); y += wrapped.length * 13
        }

        // Footer on every page
        const total = doc.getNumberOfPages()
        for (let p = 1; p <= total; p++) {
          doc.setPage(p)
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(140)
          doc.text(`vpsfinest.com/recipes/${r.id}    ·    Page ${p} of ${total}`, M, H - 28)
        }

        const buf = doc.output('arraybuffer')
        return new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${r.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`,
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
